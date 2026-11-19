const test = require("node:test");
const assert = require("node:assert/strict");
const {latestWeek, gamesFromMatchupRows, newWeekLanded} = require("./weeklyRecap");
const notes = require("./leagueNotes");

const twelve = Array.from({length: 12}, (_, i) => ({teamName: `T${i}`, points: 100 + i}));

test("latestWeek: highest week that actually has scores", () => {
  assert.equal(latestWeek({"1": twelve, "2": twelve, "10": twelve}), 10);
  assert.equal(latestWeek({"1": twelve, "2": []}), 1);
  assert.equal(latestWeek({}), 0);
  assert.equal(latestWeek(undefined), 0);
  assert.equal(latestWeek({"x": twelve}), 0);
});

const rows = [
  {week: 10, team: "Jared", opponent: "Ryan", points: 149.74, oppPoints: 131.16},
  {week: 10, team: "Ryan", opponent: "Jared", points: 131.16, oppPoints: 149.74},
  {week: 10, team: "Wayne", opponent: "Cantone", points: 78.8, oppPoints: 104.88},
  {week: 10, team: "Cantone", opponent: "Wayne", points: 104.88, oppPoints: 78.8},
  {week: 9, team: "Jared", opponent: "Foley", points: 120.64, oppPoints: 96.4},
];

test("gamesFromMatchupRows: one game per pair, scores on the right side", () => {
  const g = gamesFromMatchupRows(rows, 10);
  assert.equal(g.length, 2);
  assert.deepEqual(g[0], {home: "Cantone", away: "Wayne", homeScore: 104.88, awayScore: 78.8, final: true});
  assert.deepEqual(g[1], {home: "Jared", away: "Ryan", homeScore: 149.74, awayScore: 131.16, final: true});
});

test("gamesFromMatchupRows: other weeks and broken rows are left out, never guessed", () => {
  assert.equal(gamesFromMatchupRows(rows, 9).length, 1);
  assert.equal(gamesFromMatchupRows(rows, 11).length, 0);
  assert.equal(gamesFromMatchupRows([{week: 10, team: "Jared", opponent: "Ryan", points: null, oppPoints: 1}], 10).length, 0);
  assert.equal(gamesFromMatchupRows([{week: 10, team: "Jared", opponent: null, points: 1, oppPoints: 1}], 10).length, 0);
  assert.equal(gamesFromMatchupRows(undefined, 10).length, 0);
});

test("the games feed recapFacts unchanged", () => {
  const f = notes.recapFacts({season: 2026, week: 10, games: gamesFromMatchupRows(rows, 10), standings: []});
  assert.equal(f.games.length, 2);
  assert.deepEqual(f.high, {team: "Jared", points: 149.74});
  assert.deepEqual(f.low, {team: "Wayne", points: 78.8});
  assert.equal(f.games.find((x) => x.winner === "Jared").margin, 18.58);
});

test("newWeekLanded: only a new week in the active season drafts a recap", () => {
  const w9 = {"9": twelve}, w10 = {"9": twelve, "10": twelve};
  assert.equal(newWeekLanded({season: 2026, activeSeason: 2026, beforeWeeks: w9, afterWeeks: w10}), 10);
  assert.equal(newWeekLanded({season: "2026", activeSeason: 2026, beforeWeeks: undefined, afterWeeks: w9}), 9);
  // same week re-scraped (stat correction), or records-only change
  assert.equal(newWeekLanded({season: 2026, activeSeason: 2026, beforeWeeks: w10, afterWeeks: w10}), 0);
  // a history import of another season
  assert.equal(newWeekLanded({season: 2019, activeSeason: 2026, beforeWeeks: undefined, afterWeeks: w10}), 0);
  // doc deleted
  assert.equal(newWeekLanded({season: 2026, activeSeason: 2026, beforeWeeks: w10, afterWeeks: undefined}), 0);
});
