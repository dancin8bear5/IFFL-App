// Regression tests for the apply-retry watermark.
//
// The defect: lastProcessedChangedAt was written before the apply loop, so a
// throw mid-apply left the run recorded as processed while its writes never
// landed. The next run saw no advance in last_changed_at, returned no_change,
// and that feed change was skipped forever — silently, with a clean state doc.
const test = require("node:test");
const assert = require("node:assert/strict");
const { FakeFirestore } = require("./harness/fakeFirestore");
const { runFeedSync } = require("./ifflFeedSync");

const feedFetch = (files) => async (url) => {
  const name = url.split("/").pop();
  if (!(name in files)) return { ok: false, status: 404, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => files[name] };
};

const CHANGED = "2026-08-27T01:00:00+00:00";
const meta = (changed) => ({ format_version: 1, last_changed_at: changed, generated_at: "2026-08-27T09:00" });

const tinyLeague = () => ({
  format_version: 1, last_changed_at: CHANGED, season: 2026,
  teams: [{ id: 1, owner: "Jared", name: "Moon", espn_team_id: 4 }],
  players: [{ id: 10, espn_id: 100, name: "Kyren Williams", position: "RB", team_id: 1, prices: { 2026: 31 } }],
  draft_picks: [], trades: [],
});

// Armed so the apply path actually runs.
const seedArmed = () => ({
  config: { ifflFeed: { armed: { players: true, picks: true, trades: true } } },
  players: { pk: { name: "Kyren Williams", position: "RB", teamName: "M. Zurek", isActive: true, prices: { 2026: 29 }, ifflId: 10 } },
  draftPicks: {}, trades: {},
});

/** Wrap the fake so writes to one collection blow up, as a flaky backend would. */
const failWritesTo = (db, badCol) => new Proxy(db, {
  get(target, prop, recv) {
    if (prop === "collection") {
      return (col) => {
        const real = target.collection(col);
        if (col !== badCol) return real;
        return {
          ...real,
          get: real.get ? real.get.bind(real) : undefined,
          doc: () => ({
            set: async () => { throw new Error("backend unavailable"); },
            update: async () => { throw new Error("backend unavailable"); },
          }),
        };
      };
    }
    const v = Reflect.get(target, prop, recv);
    return typeof v === "function" ? v.bind(target) : v;
  },
});

const run = (db, files, dms) => runFeedSync({
  db,
  fetchImpl: feedFetch(files),
  feedBase: "https://feed.test/x",
  dm: async (t) => dms.push(t),
  nowIso: () => "2026-08-27T02:00:00Z",
  nowTs: () => "TS",
  tsFromMs: (ms) => ms,
});

test("a failed apply does not advance the processed watermark", async () => {
  const db = failWritesTo(new FakeFirestore(seedArmed()), "players");
  const dms = [];
  const res = await run(db, { "meta.json": meta(CHANGED), "league.json": tinyLeague() }, dms);

  assert.equal(res.status, "apply_error");
  const state = db.get("config", "ifflFeed");
  assert.notEqual(state.lastProcessedChangedAt, CHANGED,
      "watermark must stay put so the change is retried, not skipped");
  assert.match(state.lastApplyError, /apply threw/);
  assert.match(dms.at(-1), /will retry/);
});

test("the retry actually happens on the next run", async () => {
  const seeded = seedArmed();
  const failing = failWritesTo(new FakeFirestore(seeded), "players");
  const dms = [];
  await run(failing, { "meta.json": meta(CHANGED), "league.json": tinyLeague() }, dms);

  // Same state doc, healthy backend this time.
  const healthy = new FakeFirestore(seeded);
  const res = await run(healthy, { "meta.json": meta(CHANGED), "league.json": tinyLeague() }, dms);

  assert.notEqual(res.status, "no_change",
      "the skipped change must be reprocessed, not reported as already done");
});

test("a clean run still advances the watermark and records the applied mark", async () => {
  const db = new FakeFirestore(seedArmed());
  const dms = [];
  const res = await run(db, { "meta.json": meta(CHANGED), "league.json": tinyLeague() }, dms);

  assert.equal(res.status, "reported");
  const state = db.get("config", "ifflFeed");
  assert.equal(state.lastProcessedChangedAt, CHANGED);
  assert.equal(state.lastAppliedChangedAt, CHANGED);
  assert.equal(state.lastApplyError, null);
});

test("an unchanged feed is still a cheap no-op", async () => {
  const seeded = seedArmed();
  seeded.config.ifflFeed.lastProcessedChangedAt = CHANGED;
  const db = new FakeFirestore(seeded);
  const dms = [];
  const res = await run(db, { "meta.json": meta(CHANGED), "league.json": tinyLeague() }, dms);

  assert.equal(res.status, "no_change");
  assert.equal(dms.length, 0);
});
