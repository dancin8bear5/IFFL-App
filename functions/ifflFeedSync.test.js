const test = require("node:test");
const assert = require("node:assert/strict");
const { FakeFirestore } = require("./harness/fakeFirestore");
const { runFeedSync, STATE_DOC, REPORT_DOC } = require("./ifflFeedSync");

// A feed-side stub: routes by URL suffix, JSON bodies included.
const feedFetch = (files) => async (url) => {
  const name = url.split("/").pop();
  if (!(name in files)) return { ok: false, status: 404, json: async () => ({}) };
  const v = files[name];
  if (v instanceof Error) throw v;
  return { ok: true, status: 200, json: async () => v };
};

const tinyLeague = (over = {}) => ({
  format_version: 1, last_changed_at: "2026-08-27T01:00:00+00:00", season: 2026,
  teams: [{ id: 1, owner: "Jared", name: "Moon", espn_team_id: 4 }],
  players: [{ id: 10, espn_id: 100, name: "Kyren Williams", position: "RB", team_id: 1, prices: { 2026: 31 } }],
  draft_picks: [], trades: [],
  ...over,
});
const meta = (changed, over = {}) => ({ format_version: 1, last_changed_at: changed, generated_at: "2026-08-27T09:99", ...over });

const seed = () => ({
  config: {},
  players: { pk: { name: "Kyren Williams", position: "RB", teamName: "M. Zurek", isActive: true, prices: { 2026: 29 }, ifflId: 10 } },
  draftPicks: {}, trades: {},
});

const run = (db, files, dms) => runFeedSync({
  db,
  fetchImpl: feedFetch(files),
  feedBase: "https://feed.test/x",
  dm: async (t) => dms.push(t),
  nowIso: () => "2026-08-27T02:00:00Z",
});

test("a new snapshot produces a report, state, and one DM — and mutates no league data", async () => {
  const db = new FakeFirestore(seed());
  const dms = [];
  const res = await run(db, { "meta.json": meta("2026-08-27T01:00:00+00:00"), "league.json": tinyLeague() }, dms);

  assert.equal(res.status, "reported");
  const state = db.get("config", "ifflFeed");
  assert.equal(state.lastProcessedChangedAt, "2026-08-27T01:00:00+00:00");
  assert.equal(state.lastError, null);

  const report = db.get("config", "ifflFeedReport");
  assert.equal(report.mode, "report-only");
  assert.equal(report.players.teamChanges.length, 1, "Kyren M. Zurek→Jared should be reported");
  assert.equal(report.players.priceMismatches.length, 1);

  assert.equal(dms.length, 1);
  assert.match(dms[0], /Report-only — nothing was applied/);

  // The load-bearing property: league data untouched.
  assert.equal(db.get("players", "pk").teamName, "M. Zurek");
  assert.equal(db.get("players", "pk").prices["2026"], 29);
  const leagueWrites = db.writeLog.filter((w) => !w.id.startsWith("iffl") || w.col !== "config");
  assert.deepEqual(leagueWrites.filter((w) => w.col !== "config"), [], "only config docs may be written");
});

test("an unchanged snapshot is a cheap no-op — league.json is never even fetched", async () => {
  const db = new FakeFirestore(seed());
  db.doc(STATE_DOC).set({ lastProcessedChangedAt: "2026-08-27T01:00:00+00:00" });
  const dms = [];
  let leagueFetched = false;
  const res = await runFeedSync({
    db,
    fetchImpl: async (url) => {
      if (url.endsWith("league.json")) leagueFetched = true;
      return { ok: true, status: 200, json: async () => meta("2026-08-27T01:00:00+00:00") };
    },
    feedBase: "https://feed.test/x",
    dm: async (t) => dms.push(t),
    nowIso: () => "2026-08-27T02:00:00Z",
  });

  assert.equal(res.status, "no_change");
  assert.equal(leagueFetched, false, "meta gating must spare the 250KB fetch");
  assert.equal(dms.length, 0, "no change, no DM — this runs every 5 minutes");
  assert.equal(db.get("config", "ifflFeedReport"), null);
});

test("a future format_version stops everything and says so loudly", async () => {
  const db = new FakeFirestore(seed());
  const dms = [];
  const res = await run(db, { "meta.json": meta("2026-08-27T01:00:00+00:00", { format_version: 2 }) }, dms);

  assert.equal(res.status, "format_blocked");
  assert.match(db.get("config", "ifflFeed").lastError, /format_version 2/);
  assert.equal(dms.length, 1);
  assert.match(dms[0], /format_version 2/);
  assert.equal(db.get("config", "ifflFeedReport"), null, "no report from a shape we do not understand");
  // And it does NOT advance the cursor, so a fixed feed reprocesses.
  assert.equal(db.get("config", "ifflFeed").lastProcessedChangedAt, undefined);
});

test("a failed fetch records the error, keeps the cursor, and retries next run", async () => {
  const db = new FakeFirestore(seed());
  db.doc(STATE_DOC).set({ lastProcessedChangedAt: "2026-08-26T00:00:00+00:00" });
  const dms = [];

  const res = await run(db, { "meta.json": new Error("socket hang up") }, dms);
  assert.equal(res.status, "fetch_error");
  assert.match(db.get("config", "ifflFeed").lastError, /socket hang up/);
  assert.equal(db.get("config", "ifflFeed").lastProcessedChangedAt, "2026-08-26T00:00:00+00:00");

  // Recovery: same engine, feed back → processes normally.
  const res2 = await run(db, { "meta.json": meta("2026-08-27T01:00:00+00:00"), "league.json": tinyLeague() }, dms);
  assert.equal(res2.status, "reported");
  assert.equal(db.get("config", "ifflFeed").lastError, null);
});

test("a giant diff still fits in the report doc — arrays are capped with totals", async () => {
  const db = new FakeFirestore(seed());
  const players = Array.from({ length: 250 }, (_, i) => ({
    id: 1000 + i, espn_id: 5000 + i, name: `New Guy ${i}`, position: "WR", team_id: 1, prices: { 2026: 1 },
  }));
  players.push({ id: 10, espn_id: 100, name: "Kyren Williams", position: "RB", team_id: 1, prices: { 2026: 31 } });
  const dms = [];
  await run(db, { "meta.json": meta("2026-08-27T01:00:00+00:00"), "league.json": tinyLeague({ players }) }, dms);

  const report = db.get("config", "ifflFeedReport");
  assert.equal(report.players.toCreate.length, 100, "capped");
  assert.equal(report.players.toCreateTotal, 250, "true count preserved");
});
