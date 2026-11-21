// leagueFeed — the self-publishing League Feed on the website.
//
// Unlike leagueNotes (agent #3), nothing here waits for approval: a post
// goes to leagueFeed/{id} the moment its source data lands. What stands in
// for the approval is the loop in writeVerified():
//
//   write ──▶ fact check ──pass──▶ publish
//     ▲            │
//     └──rewrite───┘ fail (flags fed back; at most MAX_ATTEMPTS writes)
//                  └──still failing──▶ publish the TEMPLATE instead
//
// The template is built only from the facts, so the worst a member ever
// reads is a dull post — never an invented number. The commissioner can
// edit or hide any post afterwards (Admin → Notes → League Feed).
//
// Website only. Nothing in this file talks to GroupMe.
//
// Pure logic; the Firestore/Claude I/O is injected from index.js.

const {recapFacts, templateRecap, factCheck} = require("./leagueNotes");

const MAX_ATTEMPTS = 2;
const TYPES = ["game", "week", "trade", "record", "milestone"];
// A trade older than this is a backfill or an import, not news.
const TRADE_NEWS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const r2 = (n) => Math.round(n * 100) / 100;
const slug = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const BENCH = new Set(["bench", "be", "bn", "ir"]);
const isStarter = (r) => r?.slot && !BENCH.has(String(r.slot).toLowerCase());

/** Fixed ids: re-running a week replaces its posts, never duplicates them. */
const feedId = {
  game: (season, week, a, b) => `game-${season}-w${week}-${[slug(a), slug(b)].sort().join("-v-")}`,
  week: (season, week) => `week-${season}-w${week}`,
  trade: (tradeId) => `trade-${tradeId}`,
  record: (cardId, season, week) => `record-${cardId}-${season}-w${week}`,
  milestone: (name, date, kind) => `milestone-${slug(name)}-${date}${kind === "reminder" ? "-reminder" : ""}`,
};

function playerLines(rows, team) {
  const mine = (rows ?? []).filter((r) => r.team === team && Number.isFinite(r.points));
  const line = (r) => ({player: r.player, position: r.position ?? null, points: r2(r.points)});
  const starters = mine.filter(isStarter).sort((a, b) => b.points - a.points);
  const bench = mine.filter((r) => !isStarter(r) && String(r.slot).toLowerCase() !== "ir")
    .sort((a, b) => b.points - a.points);
  return {
    top: starters.slice(0, 3).map(line),
    dud: starters.length > 3 ? line(starters.at(-1)) : null,
    bestBench: bench[0] ? line(bench[0]) : null,
  };
}

/**
 * Everything a single game's recap may say.
 * @param game        {home, away, homeScore, awayScore} (weeklyRecap.gamesFromMatchupRows)
 * @param playerRows  historyPlayerWeeks/{season}-{WW}.rows — optional; a
 *                    recap without player lines is still a recap.
 * @param standings   espnStandings rows — optional.
 */
function gameFacts({season, week, game, playerRows = [], standings = []}) {
  const homeWon = game.homeScore >= game.awayScore;
  const winner = homeWon ? game.home : game.away;
  const loser = homeWon ? game.away : game.home;
  const rec = (t) => standings.find((s) => s.teamName === t)?.record ?? null;
  return {
    season, week,
    winner, winnerPoints: r2(homeWon ? game.homeScore : game.awayScore), winnerRecord: rec(winner),
    loser, loserPoints: r2(homeWon ? game.awayScore : game.homeScore), loserRecord: rec(loser),
    margin: r2(Math.abs(game.homeScore - game.awayScore)),
    winnerPlayers: playerLines(playerRows, winner),
    loserPlayers: playerLines(playerRows, loser),
  };
}

function templateGame(f) {
  const lines = [`${f.winner} ${f.winnerPoints}, ${f.loser} ${f.loserPoints}. Margin: ${f.margin}.`];
  const best = (label, p) => p.top[0] && lines.push(`${label} top scorer: ${p.top[0].player} (${p.top[0].points}).`);
  best(f.winner, f.winnerPlayers);
  best(f.loser, f.loserPlayers);
  return lines.join("\n");
}

/** A completed trade, reduced to what a write-up may say. */
function tradeFacts(trade, standings = []) {
  const names = (refs) => (refs ?? []).map((a) => a.displayName).filter(Boolean);
  const rec = (t) => standings.find((s) => s.teamName === t)?.record ?? null;
  const a = trade.proposingTeamName;
  const b = trade.receivingTeamName;
  return {
    season: trade.season ?? null,
    teamA: a, teamARecord: rec(a), teamAGets: names(trade.assetsFromReceiver),
    teamB: b, teamBRecord: rec(b), teamBGets: names(trade.assetsFromProposer),
  };
}

function templateTrade(f) {
  const list = (xs) => (xs.length ? xs.join(", ") : "nothing");
  return `${f.teamA} gets ${list(f.teamAGets)}.\n${f.teamB} gets ${list(f.teamBGets)}.`;
}

/** News, or a backfill? Only a trade completed inside the window is a post. */
function isFreshTrade(trade, nowMs) {
  if (trade?.status !== "completed") return false;
  if (!trade.proposingTeamName || !trade.receivingTeamName) return false;
  const t = trade.completedAt ?? trade.date;
  const ms = t == null ? NaN : typeof t.toMillis === "function" ? t.toMillis() : +new Date(t);
  return Number.isFinite(ms) && nowMs - ms >= 0 && nowMs - ms <= TRADE_NEWS_WINDOW_MS;
}

/** A league record that just fell (recordWatch.brokenRecords). */
function recordFacts({card, previous}) {
  return {
    record: card.label, kind: card.tone === "low" ? "a record nobody wants" : "a record to brag about",
    holder: card.team, mark: card.value, game: card.detail, season: card.season, week: card.week,
    previous: previous ? {holder: previous.team, mark: previous.value, season: previous.season, week: previous.week} : null,
  };
}

function templateRecord(f) {
  const prev = f.previous
    ? ` The old mark: ${f.previous.holder}, ${f.previous.mark} (${f.previous.season}, week ${f.previous.week}).` : "";
  return `New league record — ${f.record}: ${f.holder}, ${f.mark}, ${f.game}.${prev}`;
}

// ── Calendar milestones ──────────────────────────────────────
// functions/calendar.json is GENERATED from web/src/data/staticData.js
// (web/scripts/generate-functions-calendar.mjs); a web test fails when the
// two drift. The calendar is the model — this file never holds a date.
const PHASE_LABEL = {
  preseason: "Pre-season", regular: "Regular season", playoffs: "Playoffs",
  dead: "Dead period — rosters frozen", offseason: "Off-season",
};
const REMINDER_DAYS = 2;
const dayDiff = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);

/** Central-time calendar date + hour for an instant — Cloud Functions run in UTC. */
function centralNow(nowMs) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(nowMs)).map((p) => [p.type, p.value]));
  return {date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour)};
}

/**
 * What the calendar says is worth a post right now: everything dated TODAY,
 * plus a heads-up REMINDER_DAYS before anything with a clock time (those
 * are the deadlines). Nothing before 7am Central — nobody wants a midnight
 * post. A calendar that can't be read yields nothing, never a guess.
 */
function milestonesDue(calendar, nowMs) {
  const {date: today, hour} = centralNow(nowMs);
  if (hour < 7 || !Array.isArray(calendar)) return [];
  const valid = calendar.filter((m) => m?.name && /^\d{4}-\d{2}-\d{2}$/.test(m.date ?? ""))
    .sort((a, b) => a.date.localeCompare(b.date));
  const out = [];
  for (const m of valid) {
    const days = dayDiff(today, m.date);
    const kind = days === 0 ? "today" : days === REMINDER_DAYS && m.time ? "reminder" : null;
    if (!kind) continue;
    const next = valid.find((x) => x.date > m.date);
    out.push({
      kind, name: m.name, icon: m.icon ?? "", date: m.date, time: m.time ?? null,
      opensPhase: m.phase ? PHASE_LABEL[m.phase] ?? null : null,
      tentative: !!m.tentative, daysAway: days,
      next: next ? {name: next.name, date: next.date, daysAfter: dayDiff(m.date, next.date)} : null,
    });
  }
  return out;
}

function templateMilestone(f) {
  const at = f.time ? ` at ${f.time}` : "";
  const head = f.kind === "reminder"
    ? `${f.daysAway} days to go: ${f.name}, ${f.date}${at}.`
    : `Today: ${f.name}${at}.`;
  const phase = f.kind === "today" && f.opensPhase ? ` ${f.opensPhase} starts now.` : "";
  const next = f.next ? ` Next on the calendar: ${f.next.name}, ${f.next.date}.` : "";
  return head + phase + next;
}

const HARD_RULES =
  "HARD RULES: use ONLY the facts below. Every number you print must appear in the facts exactly. " +
  "Do not invent stats, injuries, players, quotes or history. Team names are the owners' names — use them as given.";
const VOICE = "Tone: sharp, funny, trash-talky, affectionate — friends who have played together for 20 years.";
const FORMAT = "Plain text for a website card: no markdown, no headline, no hashtags. Emoji sparingly.";

function prompt(intro, length, facts, voice) {
  return [
    intro, VOICE, `${length} ${FORMAT}`,
    voice ? `League voice notes:\n${voice}` : "",
    HARD_RULES, "Facts (JSON):", JSON.stringify(facts),
  ].filter(Boolean).join("\n\n");
}

const gamePrompt = (f, voice = "") => prompt(
  "You write a short recap of ONE fantasy football matchup for IFFL, a dynasty keeper league of 12 friends.",
  "2–4 sentences, under 450 characters.", f, voice);

const weekPrompt = (f, voice = "") => prompt(
  "You write the week-in-review for IFFL, a dynasty keeper fantasy football league of 12 friends.",
  "One or two short paragraphs, under 1100 characters. Cover the high and low score, the closest game and the top of the standings.",
  f, voice);

const tradePrompt = (f, voice = "") => prompt(
  "You write a short write-up of a completed trade in IFFL, a dynasty keeper fantasy football league of 12 friends.",
  "2–4 sentences, under 500 characters. Say who got what, then give a light verdict on who it suits — as opinion, with no invented stats.",
  f, voice);

const recordPrompt = (f, voice = "") => prompt(
  "A league record just fell in IFFL, a dynasty keeper fantasy football league of 12 friends. Write the announcement.",
  "2–3 sentences, under 400 characters. Name the record, the new holder and the mark; mention the old mark if the facts give one.",
  f, voice);

const milestonePrompt = (f, voice = "") => prompt(
  "You write a short calendar notice for IFFL, a dynasty keeper fantasy football league of 12 friends.",
  "1–3 sentences, under 350 characters. State what it is and exactly when (use the date and time as given). " +
  "If kind is 'reminder' it is a heads-up, not today. Do not explain league rules that are not in the facts.",
  f, voice);

/**
 * The loop. `draft(prompt)` returns text, null (no writer available), or
 * throws. Returns what to publish and how it got there.
 *
 * Guarantee: the returned body passes factCheck, OR it is the template.
 */
async function writeVerified({draft, prompt: basePrompt, facts, template, maxAttempts = MAX_ATTEMPTS}) {
  const tries = [];
  let p = basePrompt;
  for (let i = 1; i <= maxAttempts; i++) {
    let body = null;
    try {
      body = await draft(p);
    } catch (e) {
      tries.push({attempt: i, error: String(e.message ?? e).slice(0, 200)});
      continue;
    }
    if (!body) { tries.push({attempt: i, error: "no writer"}); break; }
    const flags = factCheck(body, facts);
    tries.push({attempt: i, flags});
    if (!flags.length) return {body, writer: "claude", attempts: i, tries};
    p = `${basePrompt}\n\nYour previous draft printed numbers that are NOT in the facts: ${flags.join(", ")}. ` +
      "Rewrite it without them. Use only numbers from the facts.";
  }
  return {body: template, writer: "template", attempts: tries.length, tries};
}

/** The stored document. `hidden: false` is always written — the member query filters on it. */
function feedPost({type, season, week = null, title, facts, result, now}) {
  if (!TYPES.includes(type)) throw new Error(`unknown feed type ${type}`);
  return {
    type, season, week, title,
    body: result.body, writer: result.writer, attempts: result.attempts, tries: result.tries,
    facts, hidden: false, publishedAt: now, updatedAt: now,
  };
}

/** Never overwrite a post the commissioner has touched. */
const isLocked = (existing) => !!existing && (existing.hidden === true || existing.editedAt != null);

module.exports = {
  MAX_ATTEMPTS, TYPES, TRADE_NEWS_WINDOW_MS,
  feedId, gameFacts, templateGame, tradeFacts, templateTrade, isFreshTrade,
  gamePrompt, weekPrompt, tradePrompt, writeVerified, feedPost, isLocked,
  recordFacts, templateRecord, recordPrompt,
  PHASE_LABEL, REMINDER_DAYS, centralNow, milestonesDue, templateMilestone, milestonePrompt,
  // re-exported so index.js builds the week post from one module
  weekFacts: recapFacts, templateWeek: templateRecap,
};
