const test = require("node:test");
const assert = require("node:assert/strict");
const { planApply, createdId } = require("./ifflFeedApply");
const { FakeFirestore, FakeTimestamp } = require("./harness/fakeFirestore");
const { runFeedSync, STATE_DOC } = require("./ifflFeedSync");

const league = (over = {}) => ({
  format_version: 1, last_changed_at: "2026-08-27T03:00:00+00:00", season: 2026,
  teams: [
    { id: 1, owner: "Jared", name: "Moon", espn_team_id: 4 },
    { id: 2, owner: "Matt", name: "Meta", espn_team_id: 9 },
  ],
  players: [
    { id: 10, espn_id: 100, name: "Kyren Williams", position: "RB", team_id: 1, draft_year: 2024, draft_price: 12, prices: { 2026: 31, 2027: 51 } },
    { id: 11, espn_id: 101, name: "Travis Kelce", position: "TE", team_id: null, prices: { 2026: null } },
    { id: 12, espn_id: 102, name: "Comeback Kid", position: "WR", team_id: 2, draft_year: 2025, draft_price: 3, prices: { 2026: 8 } },
    { id: 13, espn_id: 103, name: "Rams", position: "DST", team_id: 1, draft_year: 2026, draft_price: 1, prices: { 2026: 1 } },
  ],
  draft_picks: [
    { id: 50, pick_year: 2027, pick_round: 1, pick_number: 0, original_team_id: 2, current_team_id: 1, player_id: null },
    { id: 51, pick_year: 2026, pick_round: 1, pick_number: 2, original_team_id: 2, current_team_id: 2, player_id: 12 },
  ],
  trades: [],
  ...over,
});

const oursSeed = () => ({
  players: {
    pk: { name: "Kyren Williams", position: "RB", teamName: "M. Zurek", isActive: true, ifflId: 10, prices: { 2026: 29 }, purchaseYear: 2023, originalPrice: 10 },
    kelce: { name: "Travis Kelce", position: "TE", teamName: "Abad", isActive: true, ifflId: 11, prices: { 2026: 40 } },
    cb: { name: "Comeback Kid", position: "WR", teamName: "M. Zurek", isActive: false, ifflId: 12, prices: {} },
  },
  draftPicks: {
    live: { season: 2027, round: 1, originalTeamName: "M. Zurek", currentTeamName: "M. Zurek", status: "available" },
    used: { season: 2026, round: 1, originalTeamName: "M. Zurek", currentTeamName: "Jared", status: "used" },
  },
  trades: {}, config: {},
});
const oursArrays = (db) => ({
  players: db.dump("players"),
  draftPicks: db.dump("draftPicks"),
});

const ARMED = { players: true, picks: true };

test("the plan covers move, deactivate, reactivate, prices, anchors, create, and pick — with ledger rows", () => {
  const db = new FakeFirestore(oursSeed());
  const plan = planApply(league(), oursArrays(db), ARMED);
  assert.equal(plan.ok, true, plan.reasons.join("; "));
  assert.deepEqual(plan.counts, {
    teamMoves: 1,       // Kyren M. Zurek → Jared
    deactivated: 1,     // Kelce → FA
    reactivated: 1,     // Comeback Kid back onto M. Zurek
    priceUpdates: 2,    // Kyren 29→31(+2027), Comeback {}→{2026:8}
    anchorUpdates: 4,   // Kyren's two, plus Comeback Kid's two — his doc had
                        // no anchors at all, and filling a missing anchor
                        // from the feed is a correction, not a no-op
    created: 1,         // Rams DST
    pickMoves: 1,       // 2027 R1 M. Zurek → Jared
    tradesStamped: 0, tradesItemFilled: 0, tradesCreated: 0, // trades unarmed here
  });

  const kyren = plan.writes.find((w) => w.id === "pk");
  assert.equal(kyren.fields.teamName, "Jared");
  assert.deepEqual(kyren.fields.prices, { 2026: 31, 2027: 51 });
  assert.equal(kyren.fields.purchaseYear, 2024);
  assert.equal(kyren.fields.originalPrice, 12);

  const cb = plan.writes.find((w) => w.id === "cb");
  assert.equal(cb.fields.purchaseYear, 2025, "missing anchors fill from the feed");
  assert.equal(cb.fields.originalPrice, 3);

  const kelce = plan.writes.find((w) => w.id === "kelce");
  assert.deepEqual(kelce.fields, { isActive: false }, "deactivation touches nothing else");

  const created = plan.writes.find((w) => w.id === createdId(13));
  assert.equal(created.op, "set");
  assert.equal(created.fields.position, "D/ST", "feed DST becomes the app's D/ST");
  assert.equal(created.fields.ifflId, 13);

  const pick = plan.writes.find((w) => w.col === "draftPicks");
  assert.equal(pick.id, "live");
  assert.deepEqual(pick.fields, { currentTeamName: "Jared" });

  // Every ownership change leaves a ledger row; price/anchor tweaks don't.
  assert.equal(plan.ledger.length, 5);
  assert.ok(plan.ledger.every((r) => r.source === "iffl-feed" && r.type === "adjust"));
});

test("a used pick is never written, even when the feed's holder row disagrees", () => {
  const db = new FakeFirestore(oursSeed());
  const l = league();
  l.draft_picks[1].current_team_id = 2; // feed thinks M. Zurek holds the used pick; we say Jared
  const plan = planApply(l, oursArrays(db), ARMED);
  assert.ok(!plan.writes.some((w) => w.id === "used"), "spent picks are history, not sync targets");
});

test("ambiguity aborts the entire plan — no partial application", () => {
  const seed = oursSeed();
  seed.players.pk2 = { name: "Kyren Williams", position: "RB", teamName: "Bill", isActive: true, prices: {} };
  delete seed.players.pk.ifflId; // force name-matching, which now collides
  const db = new FakeFirestore(seed);
  const plan = planApply(league(), oursArrays(db), ARMED);
  assert.equal(plan.ok, false);
  assert.match(plan.reasons[0], /ambiguous/);
  assert.equal(plan.writes.length, 0);
});

test("armed:false plans nothing for that section", () => {
  const db = new FakeFirestore(oursSeed());
  const plan = planApply(league(), oursArrays(db), { players: true, picks: false });
  assert.equal(plan.counts.pickMoves, 0);
  assert.ok(!plan.writes.some((w) => w.col === "draftPicks"));
});

// ── End to end through the sync engine ────────────────────────
const feedFetch = (files) => async (url) => {
  const name = url.split("/").pop();
  return { ok: true, status: 200, json: async () => files[name] };
};
const runArmed = (db, files, dms) => runFeedSync({
  db, fetchImpl: feedFetch(files), feedBase: "https://feed.test/x",
  dm: async (t) => dms.push(t),
  nowIso: () => "2026-08-27T04:00:00Z",
  nowTs: () => FakeTimestamp.now(),
});

test("an armed run applies, records counts, DMs the applied line — and reruns clean", async () => {
  const seed = oursSeed();
  seed.config = { ifflFeed: { armed: { players: true, picks: true } } };
  const db = new FakeFirestore(seed);
  const dms = [];
  const files = { "meta.json": { format_version: 1, last_changed_at: "2026-08-27T03:00:00+00:00" }, "league.json": league() };

  const res = await runArmed(db, files, dms);
  assert.equal(res.status, "reported");
  assert.equal(res.applied.teamMoves, 1);

  // The world actually changed.
  assert.equal(db.get("players", "pk").teamName, "Jared");
  assert.equal(db.get("players", "kelce").isActive, false);
  assert.equal(db.get("players", "cb").isActive, true);
  assert.equal(db.get("players", createdId(13)).name, "Rams");
  assert.equal(db.get("draftPicks", "live").currentTeamName, "Jared");
  assert.equal(db.dump("transactions").length, 5);
  assert.match(dms[0], /APPLIED: 1 moves, 1 to FA, 1 back, 1 created/);
  assert.equal(db.get("config", "ifflFeed").lastAppliedCounts.deactivated, 1);

  // Idempotence: reprocess the SAME snapshot — nothing further to do.
  db.doc(STATE_DOC).set({ lastProcessedChangedAt: "" }, { merge: true });
  const before = db.writeLog.filter((w) => w.col === "players" || w.col === "draftPicks").length;
  const res2 = await runArmed(db, files, dms);
  assert.equal(res2.status, "reported");
  assert.deepEqual(res2.applied, {
    teamMoves: 0, deactivated: 0, reactivated: 0, priceUpdates: 0, anchorUpdates: 0, created: 0, pickMoves: 0,
    tradesStamped: 0, tradesItemFilled: 0, tradesCreated: 0,
  });
  const after = db.writeLog.filter((w) => w.col === "players" || w.col === "draftPicks").length;
  assert.equal(after, before, "second pass over the same snapshot writes zero league docs");
  assert.equal(db.dump("transactions").length, 5, "and no duplicate ledger rows");
});

test("an armed run with ambiguity refuses and says so, applying nothing", async () => {
  const seed = oursSeed();
  seed.config = { ifflFeed: { armed: { players: true, picks: true } } };
  seed.players.pk2 = { name: "Kyren Williams", position: "RB", teamName: "Bill", isActive: true, prices: {} };
  delete seed.players.pk.ifflId;
  const db = new FakeFirestore(seed);
  const dms = [];
  await runArmed(db, { "meta.json": { format_version: 1, last_changed_at: "2026-08-27T03:00:00+00:00" }, "league.json": league() }, dms);

  assert.match(dms[0], /Apply refused/);
  assert.equal(db.get("players", "pk").teamName, "M. Zurek", "nothing may move on a refused plan");
  assert.match(db.get("config", "ifflFeed").lastApplyError, /ambiguous/);
});

/* ═══════════════ Phase 5 — trade adoption ═══════════════ */

const NOW = Date.parse("2026-08-27T04:00:00Z");
const TRADES_ARMED = { players: false, picks: false, trades: true };

const tradeLeague = (over = {}) => ({
  ...league(),
  trades: [
    { id: 90, trade_date: "2026-08-26", trade_season: 2026, items: [
      { id: 1, trade_id: 90, sender_team_id: 1, receiver_team_id: 2, player_id: 10, draftpick_id: null },
      { id: 2, trade_id: 90, sender_team_id: 2, receiver_team_id: 1, player_id: null, draftpick_id: 50 },
    ] },
    { id: 91, trade_date: "2025-06-01", trade_season: 2025, items: [
      { id: 3, trade_id: 91, sender_team_id: 1, receiver_team_id: 2, player_id: 11, draftpick_id: null },
    ] },
  ],
  ...over,
});

test("an unstamped match is adopted: ifflTradeId stamped, missing pick appended to the right side", () => {
  const seed = oursSeed();
  seed.trades = {
    t1: { status: "completed", date: "2026-08-26T18:00:00Z", proposingTeamName: "Jared", receivingTeamName: "M. Zurek",
      assetsFromProposer: [{ assetId: "pk", assetType: "player", displayName: "Kyren Williams" }],
      assetsFromReceiver: [] },
  };
  const db = new FakeFirestore(seed);
  const plan = planApply(tradeLeague(), { ...oursArrays(db), trades: db.dump("trades") }, TRADES_ARMED, { nowMs: NOW });

  assert.equal(plan.counts.tradesStamped, 1);
  assert.equal(plan.counts.tradesItemFilled, 1, "the pick the trade doc lacked");
  const w = plan.writes.find((x) => x.col === "trades" && x.id === "t1");
  assert.equal(w.fields.ifflTradeId, 90);
  // The pick was SENT by M. Zurek (team 2), the receiver side.
  assert.equal(w.fields.assetsFromReceiver.length, 1);
  assert.match(w.fields.assetsFromReceiver[0].displayName, /2027 R1 \(M\. Zurek\)/);
  assert.equal(w.fields.assetsFromProposer.length, 1, "our existing item is untouched");
});

test("a stamped trade with matching items plans nothing — idempotence via ifflTradeId", () => {
  const seed = oursSeed();
  seed.trades = {
    t1: { status: "completed", date: "2026-08-26T18:00:00Z", proposingTeamName: "Jared", receivingTeamName: "M. Zurek",
      ifflTradeId: 90,
      assetsFromProposer: [{ assetId: "pk", assetType: "player", displayName: "Kyren Williams" }],
      assetsFromReceiver: [{ assetId: null, assetType: "draftPick", displayName: "2027 R1 (M. Zurek)" }] },
    t2: { status: "historical", date: "2025-06-01T12:00:00Z", proposingTeamName: "Jared", receivingTeamName: "M. Zurek",
      ifflTradeId: 91,
      assetsFromProposer: [{ assetId: null, assetType: "player", displayName: "Travis Kelce" }],
      assetsFromReceiver: [] },
  };
  const db = new FakeFirestore(seed);
  const plan = planApply(tradeLeague(), { ...oursArrays(db), trades: db.dump("trades") }, TRADES_ARMED, { nowMs: NOW });
  assert.deepEqual(plan.writes.filter((w) => w.col === "trades"), [], "nothing to do twice");
  assert.equal(plan.counts.tradesStamped, 0);
});

test("unseen feed trades are created: old ones historical, recent ones completed", () => {
  const db = new FakeFirestore(oursSeed());
  const plan = planApply(tradeLeague(), { ...oursArrays(db), trades: [] }, TRADES_ARMED, { nowMs: NOW });

  assert.equal(plan.counts.tradesCreated, 2);
  const recent = plan.writes.find((w) => w.id === "iffl-trade-90");
  assert.equal(recent.fields.status, "completed", "yesterday's trade notifies normally");
  assert.equal(recent.fields.ifflTradeId, 90);
  assert.ok(recent.tsFields.date > 0, "date rides as epoch ms for the engine to Timestamp-ify");

  const old = plan.writes.find((w) => w.id === "iffl-trade-91");
  assert.equal(old.fields.status, "historical", "a 2025 trade is a record, not news");
  assert.equal(old.fields.season, 2025);
  // Kelce is ours (ifflId 11) so his ref resolves to a real doc id.
  assert.equal(old.fields.assetsFromProposer[0].assetId, "kelce");
});

test("covered items are recognized by pick shape, so displayName variants don't duplicate", () => {
  const seed = oursSeed();
  seed.trades = {
    t1: { status: "historical", date: "2026-08-26T12:00:00Z", proposingTeamName: "Jared", receivingTeamName: "M. Zurek",
      assetsFromProposer: [{ assetId: null, assetType: "player", displayName: "Kyren Williams" }],
      // Keeper-sheet spelling of the same pick the feed calls "2027 R1".
      assetsFromReceiver: [{ assetId: null, assetType: "draftPick", displayName: "2027 1st (M. Zurek)" }] },
  };
  const db = new FakeFirestore(seed);
  const plan = planApply(tradeLeague(), { ...oursArrays(db), trades: db.dump("trades") }, TRADES_ARMED, { nowMs: NOW });
  assert.equal(plan.counts.tradesItemFilled, 0, "'2027 1st' and '2027 R1' are the same pick");
});

test("REGRESSION: the sheet's slot notation covers the same pick — no duplicate refs", () => {
  // First armed run appended "2026 R1 (A. Zurek)" beside "2026 1.02 (A.
  // Zurek)" because 1.02 didn't read as round 1. Same pick, two spellings.
  const seed = oursSeed();
  seed.trades = {
    t1: { status: "historical", date: "2026-08-26T12:00:00Z", proposingTeamName: "Jared", receivingTeamName: "M. Zurek",
      assetsFromProposer: [{ assetId: null, assetType: "player", displayName: "Kyren Williams" }],
      assetsFromReceiver: [{ assetId: null, assetType: "draftPick", displayName: "2027 1.02 (M. Zurek)" }] },
  };
  const db = new FakeFirestore(seed);
  const plan = planApply(tradeLeague(), { ...oursArrays(db), trades: db.dump("trades") }, TRADES_ARMED, { nowMs: NOW });
  assert.equal(plan.counts.tradesItemFilled, 0, "1.02 IS round 1");
});
