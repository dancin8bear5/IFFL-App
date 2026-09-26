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
const {inGameWindow} = require("./espnScores");

const MIN = 60 * 1000;

/** @param {number} season */
function checks(season) {
  return [
    {name: "ESPN standings", path: `espnStandings/${season}`, maxAgeMin: 130},
    {name: "GroupMe trades", path: "config/groupmePoller", maxAgeMin: 30},
    {name: "ESPN trade email", path: "config/espnGmailPoller", maxAgeMin: 45},
    {
      name: "ESPN live scores", path: `espnLiveScores/${season}`, maxAgeMin: 15,
      // Give the window 15 minutes to open before expecting a write.
      when: (now) => inGameWindow(now) && inGameWindow(new Date(+now - 15 * MIN)),
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
function evaluate(docs, now, season) {
  return checks(season).map((c) => {
    const base = {name: c.name, path: c.path};
    if (c.when && !c.when(now)) return {...base, ok: true, skipped: true, reason: "outside its window"};
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
