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
  const live = evaluate(docs, sunday, S).find((x) => x.name === "ESPN live scores");
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
