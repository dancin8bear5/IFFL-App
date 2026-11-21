const test = require("node:test");
const assert = require("node:assert/strict");
const rw = require("./recordWatch");

// One row per TEAM per game, like historyMatchups.
const pair = (season, week, a, pa, b, pb) => [
  {season, week, team: a, opponent: b, pts: pa, opp: pb},
  {season, week, team: b, opponent: a, pts: pb, opp: pa},
];
const book = [
  ...pair(2019, 14, "M. Zurek", 223.68, "Ryan", 73.48),
  ...pair(2018, 3, "Eric", 100.02, "Bill", 100),
  ...pair(2025, 14, "Wayne", 108.1, "Foley", 108.02),
];
const owners = new Set(["M. Zurek", "Ryan", "Bill", "Wayne", "Foley", "Jared"]);
const card = (cards, id) => cards.find((c) => c.id === id);

test("cards: scores, not flags, decide who won — and the ids are fixed", () => {
  const cards = rw.gameRecordCards(book, owners);
  assert.deepEqual(cards.map((c) => c.order), [1, 2, 3, 4, 5, 6, 7]);
  const blow = card(cards, "auto-biggest-blowout");
  assert.deepEqual([blow.team, blow.value, blow.season, blow.week], ["M. Zurek", "+150.2", 2019, 14]);
  assert.equal(blow.detail, "vs Ryan (223.68–73.48)");
});

test("cards: a departed member's better mark is a note, not the holder", () => {
  const close = card(rw.gameRecordCards(book, owners), "auto-closest-margin");
  assert.equal(close.team, "Wayne");
  assert.equal(close.value, "+0.08");
  assert.match(close.detail, /all-time: Eric \+0\.02 \(2018\) \(former member\)/);
});

test("cards: nothing to compute → no cards, never a throw", () => {
  assert.deepEqual(rw.gameRecordCards([], owners), []);
  assert.deepEqual(rw.gameRecordCards([{season: 2026, week: 1, team: "A", opponent: "B", pts: NaN, opp: 5}], owners), []);
  // A tie has no winner: only the three all-games cards exist.
  assert.equal(rw.gameRecordCards(pair(2026, 1, "Jared", 100, "Bill", 100), owners).length, 3);
});

test("brokenRecords: a new high takes the card and remembers the old holder", () => {
  const games = [...book, ...pair(2026, 11, "Jared", 270.5, "Bill", 120)];
  const broken = rw.brokenRecords(games, owners, 2026, 11);
  const ids = broken.map((b) => b.card.id);
  assert.ok(ids.includes("auto-highest-single-game"));
  assert.ok(ids.includes("auto-biggest-blowout")); // 150.5 beats 150.2
  const hi = broken.find((b) => b.card.id === "auto-highest-single-game");
  assert.equal(hi.card.team, "Jared");
  assert.deepEqual([hi.previous.team, hi.previous.value], ["M. Zurek", "223.68 pts"]);
});

test("brokenRecords: an ordinary week breaks nothing; a tied mark does not take the card", () => {
  assert.deepEqual(rw.brokenRecords([...book, ...pair(2026, 11, "Jared", 130, "Bill", 105)], owners, 2026, 11), []);
  const tied = rw.brokenRecords([...book, ...pair(2026, 11, "Jared", 223.68, "Bill", 110)], owners, 2026, 11);
  assert.equal(tied.some((b) => b.card.id === "auto-highest-single-game"), false);
  // The week isn't in the data at all → nothing, rather than a comparison with itself.
  assert.deepEqual(rw.brokenRecords(book, owners, 2026, 11), []);
});

test("gamesFromMatchupDocs skips rows it cannot read", () => {
  const games = rw.gamesFromMatchupDocs([
    {season: 2026, rows: [
      {week: 11, team: "Jared", opponent: "Bill", points: 141.26, oppPoints: 99.4},
      {week: 11, team: "Bill", opponent: "", points: 99.4, oppPoints: 141.26},
      {week: 11, team: "Ryan", opponent: "Abad", points: null, oppPoints: 100},
    ]},
    {rows: [{week: 1, team: "X", opponent: "Y", points: 1, oppPoints: 2}]},
  ]);
  assert.deepEqual(games, [{season: 2026, week: 11, team: "Jared", opponent: "Bill", pts: 141.26, opp: 99.4}]);
  assert.deepEqual([...rw.ownersOfSeason(games, 2026)], ["Jared"]);
});
