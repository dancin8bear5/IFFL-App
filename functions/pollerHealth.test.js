const test = require("node:test");
const assert = require("node:assert/strict");
const {evaluate, checks} = require("./pollerHealth");

const S = 2026;
const now = new Date("2026-09-16T15:00:00Z"); // Wed 10 AM CT — no games
const ago = (m) => new Date(+now - m * 60000);
const healthy = () => ({
  [`espnStandings/${S}`]: {lastRunAt: ago(20), lastError: null},
  "config/groupmePoller": {lastRunAt: ago(5), lastError: null},
  "config/espnGmailPoller": {lastRunAt: ago(10), lastError: null},
  [`espnLiveScores/${S}`]: {lastRunAt: ago(60 * 24 * 2), lastError: null},
});

test("all fresh → all green; live scores skipped outside game windows", () => {
  const r = evaluate(healthy(), now, S);
  assert.ok(r.every((x) => x.ok), JSON.stringify(r));
  assert.equal(r.find((x) => x.name === "ESPN live scores").skipped, true);
  assert.equal(r.find((x) => x.name === "Weekly scores").skipped, true, "optional until agent #2 runs");
});

test("a stale poller is red, and says how stale", () => {
  const docs = healthy();
  docs["config/groupmePoller"].lastRunAt = ago(90);
  const bad = evaluate(docs, now, S).filter((x) => !x.ok);
  assert.equal(bad.length, 1);
  assert.match(bad[0].reason, /stale: 90m/);
});

test("lastError is red even when fresh", () => {
  const docs = healthy();
  docs[`espnStandings/${S}`].lastError = "HTTP 503";
  assert.match(evaluate(docs, now, S).find((x) => !x.ok).reason, /503/);
});

test("a missing required doc is red", () => {
  const docs = healthy();
  delete docs["config/espnGmailPoller"];
  assert.equal(evaluate(docs, now, S).find((x) => x.path === "config/espnGmailPoller").ok, false);
});

test("live scores are checked during a game window", () => {
  const sunday = new Date("2026-09-13T20:00:00Z"); // Sun 3 PM CT
  const docs = {...healthy(), [`espnLiveScores/${S}`]: {lastRunAt: new Date(+sunday - 60 * 60000)}};
  for (const p of Object.keys(docs)) if (!p.startsWith("espnLive")) docs[p] = {lastRunAt: sunday};
  const live = evaluate(docs, sunday, S, false).find((x) => x.name === "ESPN live scores");
  assert.equal(live.ok, false);
  assert.equal(live.skipped, undefined);
});

test("Firestore Timestamps are understood", () => {
  const docs = healthy();
  docs["config/groupmePoller"].lastRunAt = {toMillis: () => +ago(3)};
  assert.ok(evaluate(docs, now, S).every((x) => x.ok));
});

test("paths are season-keyed", () => {
  assert.ok(checks(2027).some((c) => c.path === "espnStandings/2027"));
});

test("a paused live-scores poller is never expected to write, even mid-game", () => {
  // The trap this guards: pausing pollEspnScores without telling the health
  // check would report a stale espnLiveScores document every Sunday, fail
  // the health step, and fail the deploy with it.
  const sunday = new Date("2026-09-13T18:00:00Z"); // Sun 1 PM CDT, mid-window
  const live = evaluate({}, sunday, S, true).find((x) => x.name === "ESPN live scores");
  assert.equal(live.skipped, true, "paused: no write expected");
  assert.equal(live.ok, true, "paused: must never fail the deploy");
  assert.equal(live.reason, "paused", "and the health output says so, not \"outside its window\"");
})

test("the shipped flag says whether the poller is paused right now", () => {
  // Documents the live setting, so flipping it is a deliberate edit here too.
  const {LIVE_SCORES_PAUSED} = require("./espnScores");
  assert.equal(LIVE_SCORES_PAUSED, true, "paused Sep 29, 2026 at the commissioner's request");
})
