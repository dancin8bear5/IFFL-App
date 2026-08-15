// groupmeIngest — pure parsing logic for the GroupMe trade-announcement
// webhook (see index.js exports.ingestGroupMeMessage). No Firebase deps,
// unit-tested. Unlike the ESPN pipeline (a templated confirmation email),
// this is free-text human chat — jokes, rumors, and negotiations that
// fall through all look similar to a real trade right up until someone
// posts "I BACKED OUT". Because of that, ANYTHING this resolves lands in
// the review queue for a one-tap human confirm — see index.js — never
// applies on its own, no matter how cleanly it parses.
//
// Trigger phrase: "official" (as in "make it official") is the one
// signal seen in real league history reliably meaning "this deal is
// actually happening," as opposed to trade talk, rumors, or the 🚨 emoji
// (which gets used for pure banter too). TRIGGER_PHRASES is a short,
// easy-to-extend list — add to it as more real confirmation phrasing
// turns up.
const TRIGGER_PHRASES = ["official", "trade is done", "deal is done", "trade complete"];

// Name variants -> master team name, built from real GroupMe history +
// the group's Members list (real names/nicknames shown in parens next
// to each GroupMe display name). Deliberately does NOT map bare "zurek"
// (M. Zurek and A. Zurek both have that surname — stays ambiguous
// rather than guessed) or bare first names that collide with real NFL
// player names already relevant to this league (e.g. "josh" — Josh
// Allen is a rostered player, so a lone "josh" alias would wrongly
// pull Cantone into any trade message that just happens to mention
// him). Extend this table as more variants show up.
const TEAM_ALIASES = {
  jared: "Jared",
  bill: "Bill",
  "b2b champ": "Bill",
  "bill belichik": "Bill",
  ryan: "Ryan",
  "ryan schwerman": "Ryan",
  "r schwerm": "Ryan",
  wayne: "Wayne",
  "wayne vh": "Wayne",
  jason: "Jason",
  shadeson: "Jason",
  "jason alt": "Jason",
  dugan: "Dugan",
  "mike dugan": "Dugan",
  doogs: "Dugan",
  foley: "Foley",
  "brett foley": "Foley",
  cantone: "Cantone",
  "ceo of water": "Cantone",
  "josh cantone": "Cantone",
  abad: "Abad",
  "johnson-rods": "Abad",
  "corey a": "Abad",
  faybik: "Faybik",
  "michael faybik": "Faybik",
  "mike faybik": "Faybik",
  "matt zurek": "M. Zurek",
  "m. zurek": "M. Zurek",
  "m zurek": "M. Zurek",
  "a. zurek": "A. Zurek",
  "a zurek": "A. Zurek",
  "cinderella story": "A. Zurek",
};

const ORDINAL_WORD_TO_ROUND = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6,
};

function looksLikeTradeConfirmation(text) {
  const t = String(text ?? "").toLowerCase();
  return TRIGGER_PHRASES.some((phrase) => t.includes(phrase));
}

/** Whole-word/phrase, case-insensitive search — avoids "Bill" matching inside "Billy". */
function containsWord(text, phrase) {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

/** Every team alias (incl. the sender's own team) mentioned by name in the text. */
function findNamedTeams(text, teamAliases) {
  const found = new Set();
  for (const [alias, team] of Object.entries(teamAliases)) {
    if (containsWord(text, alias)) found.add(team);
  }
  return found;
}

/** Every rostered player from either candidate team whose full name appears in the text. */
function findMentionedPlayers(text, rosterSnapshot) {
  const lower = text.toLowerCase();
  return rosterSnapshot.filter((p) => lower.includes(p.name.toLowerCase()));
}

const PICK_PATTERN = /\b(\d{4}|\d{2})\s*(1st|2nd|3rd|4th|5th|6th|first|second|third|fourth|fifth|sixth)\b/gi;

/**
 * Every "[year] [round]" pick mention in the text, with a best-effort
 * attribution to whichever team was named (or "my"/"I") in the ~20
 * characters immediately before it. Attribution is a hint, not a
 * verdict — resolveGroupMeTrade still requires it to check out against
 * actual pick ownership before trusting it.
 */
function findPickMentions(text, senderTeam, teamAliases) {
  const mentions = [];
  let match;
  PICK_PATTERN.lastIndex = 0;
  while ((match = PICK_PATTERN.exec(text)) !== null) {
    const rawYear = match[1];
    const year = rawYear.length === 2 ? 2000 + Number(rawYear) : Number(rawYear);
    const roundWord = match[2].toLowerCase();
    const round = ORDINAL_WORD_TO_ROUND[roundWord] ?? Number(roundWord[0]);

    const windowStart = Math.max(0, match.index - 20);
    const window = text.slice(windowStart, match.index);
    let attributedTeam = null;
    if (/\b(my|i)\b/i.test(window)) attributedTeam = senderTeam;
    for (const [alias, team] of Object.entries(teamAliases)) {
      if (containsWord(window, alias)) attributedTeam = team; // closer match wins (later in loop = later alias checked, but window is short so any hit is trustworthy)
    }

    mentions.push({year, round, attributedTeam, index: match.index});
  }
  return mentions;
}

/**
 * The full pipeline: does this message look like a confirmed trade, and
 * if so, what moved? `rosterSnapshot` is active players from BOTH
 * candidate teams ({id, name, teamName}), `picksSnapshot` is their
 * available picks ({id, season, round, currentTeamName}). Both must be
 * scoped by the caller to the teams actually in play (or the whole
 * league, at some cost — see index.js for what it queries).
 *
 * Returns:
 *   {triggered: false}                                    — not a confirmation message at all
 *   {triggered: true, ok: false, reason, involvedTeams}    — triggered, but couldn't pin down exactly 2 sides
 *   {triggered: true, ok: false, teamA, teamB, problems}   — 2 sides found, but some/all assets didn't resolve
 *   {triggered: true, ok: true, teamA, teamB, moves}       — clean parse, ready for one-tap confirm
 */
function resolveGroupMeTrade({text, senderTeam, teamAliases = TEAM_ALIASES, rosterSnapshot, picksSnapshot}) {
  if (!looksLikeTradeConfirmation(text)) return {triggered: false};

  const namedTeams = findNamedTeams(text, teamAliases);
  const mentionedPlayers = findMentionedPlayers(text, rosterSnapshot);
  const pickMentions = findPickMentions(text, senderTeam, teamAliases);

  const involved = new Set(namedTeams);
  // Only count the sender as a trade side when they're actually talking
  // about themselves ("my"/"I") — otherwise this could just be a third
  // party (e.g. the commissioner) relaying someone else's deal.
  if (senderTeam && /\b(my|i)\b/i.test(text)) involved.add(senderTeam);
  mentionedPlayers.forEach((p) => involved.add(p.teamName));
  pickMentions.forEach((m) => { if (m.attributedTeam) involved.add(m.attributedTeam); });

  if (involved.size !== 2) {
    return {
      triggered: true,
      ok: false,
      reason: involved.size < 2
        ? "couldn't identify a second team in the message"
        : `found more than two teams mentioned (${[...involved].join(", ")}) — can't tell which two are trading`,
      involvedTeams: [...involved],
    };
  }
  const [teamA, teamB] = [...involved];
  const other = (team) => (team === teamA ? teamB : teamA);

  const moves = [];
  const problems = [];

  for (const p of mentionedPlayers) {
    if (p.teamName !== teamA && p.teamName !== teamB) continue;
    moves.push({assetType: "player", assetId: p.id, displayName: p.name, fromTeam: p.teamName, toTeam: other(p.teamName)});
  }

  for (const mention of pickMentions) {
    let fromTeam = mention.attributedTeam;
    if (fromTeam && fromTeam !== teamA && fromTeam !== teamB) fromTeam = null; // named team not actually a trade side
    if (!fromTeam) {
      // No reliable text attribution — fall back to ownership: if exactly
      // one of the two sides currently holds a matching pick, it's theirs.
      const owners = [teamA, teamB].filter((t) =>
        picksSnapshot.some((pk) => pk.currentTeamName === t && pk.season === mention.year && pk.round === mention.round));
      if (owners.length === 1) fromTeam = owners[0];
    }
    if (!fromTeam) {
      problems.push({assetType: "pick", year: mention.year, round: mention.round,
        reason: `couldn't tell which side the ${mention.year} round ${mention.round} pick belongs to`});
      continue;
    }
    const candidates = picksSnapshot.filter((pk) =>
      pk.currentTeamName === fromTeam && pk.season === mention.year && pk.round === mention.round);
    if (candidates.length === 0) {
      problems.push({assetType: "pick", year: mention.year, round: mention.round, fromTeam,
        reason: `${fromTeam} doesn't currently hold a ${mention.year} round ${mention.round} pick`});
    } else if (candidates.length > 1) {
      problems.push({assetType: "pick", year: mention.year, round: mention.round, fromTeam,
        reason: `${fromTeam} holds ${candidates.length} ${mention.year} round ${mention.round} picks — ambiguous`});
    } else {
      moves.push({assetType: "pick", assetId: candidates[0].id,
        displayName: `${mention.year} Round ${mention.round}`, fromTeam, toTeam: other(fromTeam)});
    }
  }

  if (moves.length === 0) {
    problems.push({reason: "trigger phrase found, but no players or picks could be matched in the message"});
  }

  if (problems.length > 0) return {triggered: true, ok: false, teamA, teamB, moves, problems};
  return {triggered: true, ok: true, teamA, teamB, moves};
}

module.exports = {
  TRIGGER_PHRASES, TEAM_ALIASES, ORDINAL_WORD_TO_ROUND,
  looksLikeTradeConfirmation, findNamedTeams, findMentionedPlayers, findPickMentions,
  resolveGroupMeTrade,
};
