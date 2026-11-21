const test = require("node:test");
const assert = require("node:assert/strict");
const {diffHealth, watchdogMessage, REMIND_MS} = require("./watchdog");

const T = Date.parse("2026-11-22T15:00:00Z");
const H = 3600000;
const ok = (name) => ({name, ok: true, reason: "5m old"});
const bad = (name, reason = "stale: 90m old (max 30m)") => ({name, ok: false, reason});

test("all healthy, nothing before → silence", () => {
  const d = diffHealth({}, [ok("A"), ok("B")], T);
  assert.deepEqual(d.failing, {});
  assert.equal(watchdogMessage(d, T), null);
});

test("a job breaking is announced once, not every hour", () => {
  const first = diffHealth({}, [ok("A"), bad("Backup")], T);
  assert.match(watchdogMessage(first, T), /🔴 Backup — stale: 90m/);
  const next = diffHealth({failing: first.failing}, [ok("A"), bad("Backup")], T + H);
  assert.equal(watchdogMessage(next, T + H), null);
  assert.equal(next.failing.Backup.since, T, "the outage keeps its start time");
});

test("recovery is announced, and clears the state", () => {
  const first = diffHealth({}, [bad("Backup")], T);
  const fixed = diffHealth({failing: first.failing}, [ok("Backup")], T + 2 * H);
  assert.deepEqual(fixed.failing, {});
  assert.match(watchdogMessage(fixed, T + 2 * H), /🟢 Backup — back to normal/);
});

test("still broken a day later → one nudge, then quiet for another day", () => {
  const first = diffHealth({}, [bad("Backup")], T);
  const day = diffHealth({failing: first.failing}, [bad("Backup")], T + REMIND_MS);
  assert.match(watchdogMessage(day, T + REMIND_MS), /🟠 still down 24h: Backup/);
  const after = diffHealth({failing: day.failing}, [bad("Backup")], T + REMIND_MS + H);
  assert.equal(watchdogMessage(after, T + REMIND_MS + H), null);
});

test("a second job breaking during an outage is its own alert", () => {
  const first = diffHealth({}, [bad("Backup"), ok("Scores")], T);
  const second = diffHealth({failing: first.failing}, [bad("Backup"), bad("Scores", "lastError: HTTP 500")], T + H);
  assert.deepEqual(second.broke, [{name: "Scores", reason: "lastError: HTTP 500"}]);
  assert.equal(Object.keys(second.failing).length, 2);
});

test("an unreadable previous state is treated as 'nothing was failing'", () => {
  for (const prev of [null, undefined, {failing: "oops"}, {}]) {
    assert.equal(diffHealth(prev, [bad("Backup")], T).broke.length, 1);
  }
});
