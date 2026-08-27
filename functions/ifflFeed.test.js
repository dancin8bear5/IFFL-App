const test = require("node:test");
const assert = require("node:assert/strict");
const {
  OWNER_TO_TEAM, normalizeName, normalizePosition, matchTeams, matchPlayers, priceDiffs, diffSnapshot,
} = require("./ifflFeed");

// ── Normalization: the guide's own examples are the spec ──────
test("normalization matches the guide's worked examples", () => {
  assert.equal(normalizeName("A.J. Brown"), "ajbrown");
  assert.equal(normalizeName("Ja'Marr Chase"), "jamarrchase");
  assert.equal(normalizeName("Aaron Jones Sr."), "aaronjones");
  assert.equal(normalizeName("Amon-Ra St. Brown"), "amonrastbrown");
  // D/ST both ways: their bare team name and our suffixed form converge.
  assert.equal(normalizeName("Texans D/ST"), "texans");
  assert.equal(normalizeName("Texans"), "texans");
  assert.equal(normalizeName("Kenneth Walker III"), "kennethwalker");
});

test("position normalization folds D/ST into DST", () => {
  assert.equal(normalizePosition("D/ST"), "DST");
  assert.equal(normalizePosition("DST"), "DST");
  assert.equal(normalizePosition("QB"), "QB");
});

// ── Teams: owners are the identity ────────────────────────────
test("all twelve live feed owners resolve to distinct master names", () => {
  const owners = ["Andrew", "Bill", "Brett", "Corey", "Jared", "Jason", "Josh", "Matt", "Mike D.", "Mike F.", "Ryan", "Wayne"];
  const { byIfflId, problems } = matchTeams(owners.map((o, i) => ({ id: i + 1, owner: o, name: `Team ${o}` })));
  assert.equal(problems.length, 0, problems.join("; "));
  assert.equal(byIfflId.size, 12);
  assert.equal(new Set([...byIfflId.values()].map((v) => v.ourName)).size, 12);
  assert.equal(byIfflId.get(owners.indexOf("Matt") + 1).ourName, "M. Zurek");
  assert.equal(byIfflId.get(owners.indexOf("Mike D.") + 1).ourName, "Dugan");
});

test("an unknown owner is a loud problem, not a guess", () => {
  const { problems } = matchTeams([{ id: 1, owner: "Steve", name: "New Guy" }]);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /Steve/);
});

// ── Player matching precedence ────────────────────────────────
const ourP = (id, name, pos, extra = {}) => ({ id, name, position: pos, isActive: true, ...extra });

test("stored ifflId beats every other signal", () => {
  const ours = [ourP("a", "Totally Different Name", "QB", { ifflId: 7 })];
  const { matched } = matchPlayers([{ id: 7, name: "Sam Darnold", position: "QB" }], ours);
  assert.equal(matched.length, 1);
  assert.equal(matched[0].via, "ifflId");
});

test("espnId matches when names disagree", () => {
  const ours = [ourP("a", "Kenny Gainwell", "RB", { espnId: 4372414 })];
  const { matched } = matchPlayers([{ id: 1, espn_id: 4372414, name: "Kenneth Gainwell", position: "RB" }], ours);
  assert.equal(matched[0].via, "espnId");
});

test("name+position disambiguates two players who normalize alike", () => {
  const ours = [ourP("a", "Josh Allen", "QB"), ourP("b", "Josh Allen", "DST")];
  const { matched, ambiguous } = matchPlayers([{ id: 1, name: "Josh Allen", position: "QB" }], ours);
  assert.equal(ambiguous.length, 0);
  assert.equal(matched[0].ours.id, "a");
});

test("two ACTIVE docs with the same name+position are ambiguous, never guessed", () => {
  const ours = [ourP("a", "Dak Prescott", "QB"), ourP("b", "Dak Prescott", "QB")];
  const { matched, ambiguous } = matchPlayers([{ id: 1, name: "Dak Prescott", position: "QB" }], ours);
  assert.equal(matched.length, 0);
  assert.equal(ambiguous.length, 1);
  assert.deepEqual(ambiguous[0].candidates.sort(), ["a", "b"]);
});

test("an inactive duplicate loses to the active doc", () => {
  const ours = [ourP("a", "Dak Prescott", "QB", { isActive: false }), ourP("b", "Dak Prescott", "QB")];
  const { matched } = matchPlayers([{ id: 1, name: "Dak Prescott", position: "QB" }], ours);
  assert.equal(matched[0].ours.id, "b");
});

// ── Price diff ────────────────────────────────────────────────
test("price maps compare per-year; null and missing agree", () => {
  assert.deepEqual(priceDiffs({ 2026: 31 }, { 2026: 31 }), []);
  assert.deepEqual(priceDiffs({ 2026: 31 }, { 2026: 29 }), [{ year: "2026", feed: 31, ours: 29 }]);
  assert.deepEqual(priceDiffs({ 2026: null }, {}), []);
});

// ── Snapshot diff, end to end on a tiny league ────────────────
const tinyFeed = () => ({
  format_version: 1, last_changed_at: "2026-08-27T00:00:00Z", season: 2026,
  teams: [
    { id: 1, owner: "Jared", name: "Moon", espn_team_id: 4 },
    { id: 2, owner: "Matt", name: "Meta Knights", espn_team_id: 9 },
  ],
  players: [
    { id: 10, espn_id: 100, name: "Kyren Williams", position: "RB", team_id: 1, draft_year: 2024, draft_price: 12, prices: { 2026: 31 } },
    { id: 11, espn_id: 101, name: "Malik Willis", position: "QB", team_id: 2, draft_year: 2025, draft_price: 2, prices: { 2026: 2 } },
    { id: 12, espn_id: 102, name: "Ray Davis", position: "RB", team_id: null, prices: { 2026: null } },
    { id: 13, espn_id: 103, name: "Brand New Rookie", position: "WR", team_id: 1, draft_year: 2026, draft_price: 5, prices: { 2026: 5 } },
  ],
  draft_picks: [
    { id: 50, pick_year: 2027, pick_round: 1, pick_number: 0, original_team_id: 2, current_team_id: 1, player_id: null },
  ],
  trades: [
    { id: 90, trade_date: "2026-08-26", trade_season: 2026, items: [
      { id: 1, trade_id: 90, sender_team_id: 1, receiver_team_id: 2, player_id: 11, draftpick_id: null },
      { id: 2, trade_id: 90, sender_team_id: 2, receiver_team_id: 1, player_id: 10, draftpick_id: null },
      { id: 3, trade_id: 90, sender_team_id: 2, receiver_team_id: 1, player_id: null, draftpick_id: 50 },
    ] },
  ],
});

const tinyOurs = () => ({
  players: [
    { id: "pk", name: "Kyren Williams", position: "RB", teamName: "M. Zurek", isActive: true, prices: { 2026: 31 }, purchaseYear: 2024, originalPrice: 12 },
    { id: "pw", name: "Malik Willis", position: "QB", teamName: "Jared", isActive: true, prices: { 2026: 4 }, purchaseYear: 2025, originalPrice: 2 },
    { id: "pr", name: "Ray Davis", position: "RB", teamName: "Wayne", isActive: true, prices: { 2026: 8 } },
  ],
  draftPicks: [
    { id: "dp1", season: 2027, round: 1, originalTeamName: "M. Zurek", currentTeamName: "M. Zurek", status: "available" },
  ],
  trades: [
    { id: "t1", status: "completed", date: "2026-08-26T18:00:00Z", proposingTeamName: "Jared", receivingTeamName: "M. Zurek",
      assetsFromProposer: [{ displayName: "Malik Willis" }], assetsFromReceiver: [{ displayName: "Kyren Williams" }] },
  ],
});

test("the tiny league diff finds exactly the planted discrepancies", () => {
  const r = diffSnapshot(tinyFeed(), tinyOurs());
  assert.equal(r.problems.length, 0, r.problems.join("; "));

  // Kyren: feed says Jared, we say M. Zurek (the un-applied trade) → team change.
  assert.deepEqual(r.players.teamChanges.map((c) => [c.name, c.ours, c.feed]),
    [["Kyren Williams", "M. Zurek", "Jared"], ["Malik Willis", "Jared", "M. Zurek"]]);

  // Willis price disagrees ($4 vs $2).
  assert.equal(r.players.priceMismatches.length, 1);
  assert.equal(r.players.priceMismatches[0].name, "Malik Willis");

  // Ray Davis went to free agency.
  assert.deepEqual(r.players.becameFreeAgent.map((f) => f.name), ["Ray Davis"]);

  // The rookie only the feed knows → would create.
  assert.deepEqual(r.players.toCreate.map((c) => c.name), ["Brand New Rookie"]);

  // The 2027 R1: feed says Jared holds it, we say M. Zurek.
  assert.equal(r.picks.ownershipChanges.length, 1);
  assert.deepEqual([r.picks.ownershipChanges[0].ours, r.picks.ownershipChanges[0].feed], ["M. Zurek", "Jared"]);

  // The trade matches ours but the feed has a third item (the pick).
  assert.equal(r.trades.adopted.length, 0);
  assert.equal(r.trades.adoptedNeedingItems.length, 1);
  assert.equal(r.trades.adoptedNeedingItems[0].ourTradeId, "t1");
  assert.equal(r.trades.adoptedNeedingItems[0].feedItems, 3);
  assert.equal(r.trades.adoptedNeedingItems[0].ourItems, 2);
  assert.equal(r.trades.newFromFeed.length, 0);
});

test("a future format_version stops the plan cold", () => {
  const f = tinyFeed(); f.format_version = 2;
  const r = diffSnapshot(f, tinyOurs());
  assert.equal(r.problems.length, 1);
  assert.match(r.problems[0], /format_version 2/);
  assert.equal(r.players.matchedCount, 0);
});

test("free agents unknown to us are counted, never created", () => {
  const f = tinyFeed();
  f.players.push({ id: 99, espn_id: 999, name: "Some Streamer", position: "TE", team_id: null, prices: {} });
  const r = diffSnapshot(f, tinyOurs());
  assert.equal(r.players.feedFreeAgentsIgnored, 1);
  assert.ok(!r.players.toCreate.some((c) => c.name === "Some Streamer"));
});
