// pollerHealth — is every scheduled job actually running?
//
// Each poller writes {lastRunAt, lastError} to a state doc. This decides,
// for a given instant, whether each doc is healthy. Pure: docs + now in,
// verdicts out. The deploy workflow's critical-process step
// (scripts/check-health.js) does the Firestore reads and fails the run on
// any red.
//
// `when` gates a check to the hours the job is supposed to write. The live
// scoreboard returns early outside NFL windows by design, so a stale doc on
// a Wednesday is correct, not a failure.
const {inGameWindow, LIVE_SCORES_PAUSED} = require("./espnScores");

const MIN = 60 * 1000;

/**
 * @param {number} season
 * @param {boolean} paused  whether the live-scores poller is paused. An
 *   argument rather than a straight read of the constant so BOTH halves of
 *   the rule stay provable — that a paused poller is never expected to
 *   write, and that a running one is expected to during a game window.
 *   Flipping the flag would otherwise silently retire one of those tests.
 */
function checks(season, paused = LIVE_SCORES_PAUSED) {
  return [
    {name: "ESPN standings", path: `espnStandings/${season}`, maxAgeMin: 130},
    {name: "GroupMe trades", path: "config/groupmePoller", maxAgeMin: 30},
    {name: "ESPN trade email", path: "config/espnGmailPoller", maxAgeMin: 45},
    {
      name: "ESPN live scores", path: `espnLiveScores/${season}`, maxAgeMin: 15,
      // Give the window 15 minutes to open before expecting a write — and
      // expect nothing at all while the poller is paused, or every Sunday
      // would report a stale document and fail the deploy.
      when: (now) => !paused
        && inGameWindow(now) && inGameWindow(new Date(+now - 15 * MIN)),
      // Say WHICH kind of skip this is: "outside its window" would read as
      // "no games on" to whoever runs check-health, when the truth is that
      // the poller is switched off.
      skipReason: paused ? "paused" : undefined,
    },
    {
      name: "Weekly scores", path: "config/weeklyPoller", maxAgeMin: 8 * 24 * 60,
      optional: true, // added by agent #2; absent until its first run
    },
  ];
}

function toMs(v) {
  if (v == null) return null;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (v instanceof Date) return +v;
  if (typeof v === "number") return v;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

/**
 * @param {Record<string, object|null>} docs  path → doc data (null = missing)
 * @param {Date} now
 * @param {number} season
 * @returns {{name, path, ok, skipped, reason}[]}
 */
function evaluate(docs, now, season, paused = LIVE_SCORES_PAUSED) {
  return checks(season, paused).map((c) => {
    const base = {name: c.name, path: c.path};
    if (c.when && !c.when(now)) {
      return {...base, ok: true, skipped: true, reason: c.skipReason ?? "outside its window"};
    }
    const d = docs[c.path];
    if (!d) {
      return c.optional
        ? {...base, ok: true, skipped: true, reason: "not created yet"}
        : {...base, ok: false, reason: "state doc missing"};
    }
    if (d.lastError) return {...base, ok: false, reason: `lastError: ${String(d.lastError).slice(0, 160)}`};
    const last = toMs(d.lastRunAt);
    if (last == null) return {...base, ok: false, reason: "no lastRunAt"};
    const ageMin = Math.round((+now - last) / MIN);
    if (ageMin > c.maxAgeMin) return {...base, ok: false, reason: `stale: ${ageMin}m old (max ${c.maxAgeMin}m)`};
    return {...base, ok: true, reason: `${ageMin}m old`};
  });
}

module.exports = {checks, evaluate, toMs};
