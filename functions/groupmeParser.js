// groupmeParser — structured trade detection for GroupMe messages.
//
// Replaces the old keyword-only classifier. It does three new things:
//   1. Detects trade SYNTAX ("X gets Y", "for", "+", pick tokens), not just
//      the word "trade" — so a real deal like
//      "Jason gets Dak / Jared gets Jason's 2027 2nd + Turpin" is caught.
//   2. Extracts STRUCTURED content — teams, players, and draft picks — into
//      the signal so the review UI (and reconciliation) sees the actual deal.
//   3. Links a bare 🚨 siren to same-sender follow-up messages within a short
//      window, so the siren and the deal text become ONE review item.
//
// Pure logic, no Firebase deps — unit-tests clean like tradeIngest.js.
//
// Team identity map MUST stay in sync with web/src/data/staticData.js's
// `fantasyTeams`. There's no shared module across runtimes, so this is an
// intentional second copy. Update both if the league changes names/abbrevs.

// name -> { espnName, groupMeName, abbrev } for all 12 teams.
const TEAMS = [
  { name: "A. Zurek", espnName: "Cinderella Story", groupMeName: "Cinderella Story", abbrev: "TACO" },
  { name: "Abad", espnName: "Horner Park Johnson-Rods", groupMeName: "Johnson-Rods 3.0", abbrev: "JRDP" },
  { name: "Bill", espnName: "bill pony club", groupMeName: "B2B Champ", abbrev: "BILL" },
  { name: "Cantone", espnName: "Aussie Rookie Ramblers", groupMeName: "CEO OF WATER", abbrev: "ARR" },
  { name: "Dugan", espnName: "Cream Of Wheaton", groupMeName: "Mike Dugan", abbrev: "DPGE" },
  { name: "Faybik", espnName: "Allegiant Pots N Pans", groupMeName: "Michael Faybik", abbrev: "PNP" },
  { name: "Foley", espnName: "Wheaton Creampeyes", groupMeName: "Brett Foley", abbrev: "BF" },
  { name: "Jared", espnName: "Shoot the Moon: IV", groupMeName: "Jared", abbrev: "MOON" },
  { name: "Jason", espnName: "The Mojave Miracles", groupMeName: "Shadeson", abbrev: "CATS" },
  { name: "M. Zurek", espnName: "Meta Knights", groupMeName: "Matt Zurek", abbrev: "ZHop" },
  { name: "Ryan", espnName: "The Replacements", groupMeName: "Ryan Schwerman", abbrev: "Ryan" },
  { name: "Wayne", espnName: "River Forest Republicans", groupMeName: "Wayne VH", abbrev: "GOP" },
];

// Owner first names — chat almost always refers to people by first name
// ("Jason gets Dak", "Jared gets..."). Maps first-name token -> team name.
const OWNER_FIRST_NAME = {
  jared: "Jared",
  jason: "Jason",
  bill: "Bill",
  billy: "Bill",
  mike: null, // ambiguous: Dugan or Faybik — don't auto-resolve
  dugan: "Dugan",
  faybik: "Faybik",
  corey: "Abad",
  abad: "Abad",
  josh: "Cantone",
  cantone: "Cantone",
  brett: "Foley",
  foley: "Foley",
  matt: "M. Zurek",
  zurek: null, // ambiguous: Matt or Andrew
  andrew: "A. Zurek",
  ryan: "Ryan",
  wayne: "Wayne",
};

// The 🚨 siren is the league's near-universal trade flag.
const SIREN = "\uD83D\uDEA8"; // 🚨

// Backup keyword net for unflagged announcements.
const TRADE_SIGNAL_KEYWORDS = [
  "trade", "trading", "traded",
  "offer", "offering",
  "propose", "proposal", "proposing",
  "deal", "swap", "veto",
  "accepted", "in exchange", "for your",
];

// Draft-pick token detection. Catches "2027 2nd", "2027 R1", "'27 1st",
// "2nd round pick", "first rounder", "1st", etc. Year is optional.
// Returns array of { year, round, raw }.
const ORDINAL_WORD = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7 };

function extractPicks(text) {
  const picks = [];
  const seen = new Set();
  const lower = String(text ?? "");

  // Pattern A: optional 4-digit or 'YY year, then round as 1st/2nd/R1/2 round/second
  //   examples: "2027 2nd", "2027 R1", "'27 1st", "2027 second round pick"
  const reA = /(?:\b(20\d{2})\b|['’](\d{2})\b)?\s*(?:R(\d)\b|(\d)(?:st|nd|rd|th)\b|\b(first|second|third|fourth|fifth|sixth|seventh)\b)\s*(?:round\s*)?(?:pick|rounder|rd)?/gi;
  let m;
  while ((m = reA.exec(lower)) !== null) {
    const yearFull = m[1];
    const yearShort = m[2];
    const rNum = m[3] || m[4];
    const rWord = m[5];
    // Require SOME round signal
    let round = null;
    if (rNum) round = parseInt(rNum, 10);
    else if (rWord) round = ORDINAL_WORD[rWord.toLowerCase()];
    if (!round || round < 1 || round > 20) continue;
    // Require this to look pick-ish: either a year present, or the words
    // round/pick/rounder/R#. A bare "1st" with no context is too noisy.
    const raw = m[0].trim();
    const looksPickish =
      yearFull || yearShort || /round|pick|rounder|\brd\b/i.test(raw) || /^R\d/i.test(raw);
    if (!looksPickish) continue;
    let year = null;
    if (yearFull) year = parseInt(yearFull, 10);
    else if (yearShort) year = 2000 + parseInt(yearShort, 10);
    const key = `${year ?? "?"}-${round}`;
    if (seen.has(key)) continue;
    seen.add(key);
    picks.push({ year, round, raw });
  }
  return picks;
}

// Resolve a chat token/phrase to a team name. Tries owner first-name,
// groupMeName, abbrev, then internal name. Case-insensitive.
function resolveTeamToken(token) {
  const t = String(token ?? "").toLowerCase().trim();
  if (!t) return null;
  if (Object.prototype.hasOwnProperty.call(OWNER_FIRST_NAME, t)) return OWNER_FIRST_NAME[t];
  for (const team of TEAMS) {
    if (team.groupMeName.toLowerCase() === t) return team.name;
    if (team.abbrev.toLowerCase() === t) return team.name;
    if (team.name.toLowerCase() === t) return team.name;
  }
  return null;
}

// Detect "X gets Y" / "X sends Y" / "X trades Y" direction phrases and the
// teams referenced. Returns { teams: [names], directionPhrases: [...] }.
function extractDirection(text) {
  const teams = new Set();
  const directionPhrases = [];
  const lower = String(text ?? "").toLowerCase();

  // "<name> gets/sends/trades/receives ..."
  const reDir = /\b([a-z.]+)\s+(gets|get|sends|send|trades|trade|receives|receive|gives|give)\b/gi;
  let m;
  while ((m = reDir.exec(lower)) !== null) {
    const team = resolveTeamToken(m[1]);
    if (team) {
      teams.add(team);
      directionPhrases.push({ team, verb: m[2].toLowerCase(), raw: m[0].trim() });
    }
  }
  return { teams: [...teams], directionPhrases };
}

/**
 * Classify a single GroupMe message for trade signal. Returns
 * { hit, reasons[], extracted } where extracted = { picks, teams, directionPhrases }.
 * Structured extraction runs regardless of what tripped the filter, so the
 * review UI + reconciliation always get whatever content is present.
 */
function classifyTradeSignal(msg) {
  if (!msg || msg.system) return { hit: false, reasons: [], extracted: emptyExtract() };
  const text = String(msg.text ?? "");
  if (!text.trim()) return { hit: false, reasons: [], extracted: emptyExtract() };

  const reasons = [];
  if (text.includes(SIREN)) reasons.push(`emoji:${SIREN}`);

  const lower = text.toLowerCase();
  for (const kw of TRADE_SIGNAL_KEYWORDS) {
    if (lower.includes(kw)) reasons.push(`keyword:${kw}`);
  }

  const picks = extractPicks(text);
  const { teams, directionPhrases } = extractDirection(text);

  // Trade-SYNTAX signals (the fix for today's miss): a direction phrase that
  // resolves to a real team, OR a pick token, OR "X for Y" / "+" asset syntax
  // alongside a resolved team.
  if (directionPhrases.length > 0) reasons.push("syntax:direction");
  if (picks.length > 0) reasons.push("syntax:pick");
  // "for" / "+" as an asset-swap connector only counts when a team is present,
  // to avoid firing on ordinary chatter.
  if (teams.length > 0 && /\bfor\b|\+/.test(lower)) reasons.push("syntax:swap");

  const extracted = { picks, teams, directionPhrases };
  return { hit: reasons.length > 0, reasons, extracted };
}

function emptyExtract() {
  return { picks: [], teams: [], directionPhrases: [] };
}

/**
 * Stitch a bare/low-content siren to its follow-up deal text.
 *
 * messages: array of {id, sender_id, name, text, created_at} oldest-first.
 * windowSec: how long after a siren to keep absorbing the same sender's msgs.
 *
 * Returns an array of "signal groups": each group is one review item with a
 * primary message plus any stitched follow-ups, and merged structured content.
 * A siren with no content of its own pulls in the sender's next messages
 * (within the window) so the deal that follows the 🚨 lands in the same item.
 */
function buildSignalGroups(messages, windowSec = 180) {
  const groups = [];
  const consumed = new Set();
  const list = [...(messages ?? [])].filter((m) => m && !m.system);

  for (let i = 0; i < list.length; i++) {
    const msg = list[i];
    if (consumed.has(msg.id)) continue;
    const base = classifyTradeSignal(msg);
    if (!base.hit) continue;

    const members = [msg];
    const reasons = new Set(base.reasons);
    let merged = mergeExtract(emptyExtract(), base.extracted);

    // If this signal is a siren that carries little/no structured content,
    // absorb same-sender follow-ups within the window to find the deal.
    const isThinSiren =
      base.reasons.includes(`emoji:${SIREN}`) &&
      base.extracted.picks.length === 0 &&
      base.extracted.directionPhrases.length === 0;

    // Always try to stitch same-sender follow-ups for ANY siren, since the
    // deal text commonly arrives as a separate message right after.
    const stitch = base.reasons.includes(`emoji:${SIREN}`) || isThinSiren;
    if (stitch) {
      for (let j = i + 1; j < list.length; j++) {
        const next = list[j];
        if (next.sender_id !== msg.sender_id) break; // different sender ends the window
        if ((next.created_at - msg.created_at) > windowSec) break;
        const nc = classifyTradeSignal(next);
        // Absorb if the follow-up has trade content OR is a bare continuation
        // that adds structure (picks/direction/teams/players).
        const hasStructure =
          nc.extracted.picks.length > 0 ||
          nc.extracted.directionPhrases.length > 0 ||
          nc.extracted.teams.length > 0 ||
          nc.reasons.length > 0;
        if (!hasStructure) break;
        members.push(next);
        consumed.add(next.id);
        for (const r of nc.reasons) reasons.add(r);
        merged = mergeExtract(merged, nc.extracted);
      }
    }

    consumed.add(msg.id);
    groups.push({
      primaryId: String(msg.id),
      messageIds: members.map((x) => String(x.id)),
      senderId: msg.sender_id ?? null,
      senderName: msg.name ?? "Unknown",
      text: members.map((x) => x.text ?? "").join("\n").trim(),
      reasons: [...reasons],
      extracted: merged,
      postedAtSec: msg.created_at ?? null,
    });
  }
  return groups;
}

function mergeExtract(a, b) {
  const picks = [...a.picks];
  const seen = new Set(picks.map((p) => `${p.year ?? "?"}-${p.round}`));
  for (const p of b.picks) {
    const k = `${p.year ?? "?"}-${p.round}`;
    if (!seen.has(k)) { seen.add(k); picks.push(p); }
  }
  const teams = [...new Set([...a.teams, ...b.teams])];
  const directionPhrases = [...a.directionPhrases, ...b.directionPhrases];
  return { picks, teams, directionPhrases };
}

module.exports = {
  TEAMS,
  SIREN,
  TRADE_SIGNAL_KEYWORDS,
  extractPicks,
  extractDirection,
  resolveTeamToken,
  classifyTradeSignal,
  buildSignalGroups,
};
