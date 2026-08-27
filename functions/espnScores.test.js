const test = require("node:test");
const assert = require("node:assert/strict");
const { parseScoreboard, currentWeek, inGameWindow, ESPN_TEAM_ID_TO_NAME } = require("./espnScores");

const resp = (over = {}) => ({
  scoringPeriodId: 0,
  status: { currentMatchupPeriod: 1 },
  schedule: [
    { id: 1, matchupPeriodId: 1, home: { teamId: 10, totalPoints: 92.4 }, away: { teamId: 5, totalPoints: 88.1 }, winner: "UNDECIDED" },
    { id: 2, matchupPeriodId: 1, home: { teamId: 6, totalPoints: 120 }, away: { teamId: 2, totalPoints: 99 }, winner: "HOME" },
    { id: 3, matchupPeriodId: 2, home: { teamId: 10, totalPoints: 0 }, away: { teamId: 6, totalPoints: 0 }, winner: "UNDECIDED" },
  ],
  ...over,
});

test("all twelve ESPN ids map to distinct master team names", () => {
  const names = Object.values(ESPN_TEAM_ID_TO_NAME);
  assert.equal(names.length, 12);
  assert.equal(new Set(names).size, 12);
});

test("week selection prefers the live scoring period, falls back, never returns 0", () => {
  assert.equal(currentWeek({ scoringPeriodId: 7, status: { currentMatchupPeriod: 6 } }), 7);
  assert.equal(currentWeek({ scoringPeriodId: 0, status: { currentMatchupPeriod: 3 } }), 3, "preseason uses matchup period");
  assert.equal(currentWeek({}), 1, "an empty response still asks for a real week");
});

test("a week's games parse with our team names, scores, and final flags", () => {
  const r = parseScoreboard(resp());
  assert.equal(r.week, 1, "preseason resolves to matchup period 1");
  assert.equal(r.games.length, 2, "week 2 is excluded");
  assert.deepEqual(r.games[0], {
    matchupId: 1, home: "Jared", away: "M. Zurek", homeScore: 92.4, awayScore: 88.1, winner: null, final: false,
  });
  assert.equal(r.games[1].final, true, "a decided matchup is final");
  assert.equal(r.games[1].winner, "HOME");
  assert.equal(r.problems.length, 0);
});

test("an unknown ESPN team id is reported, never guessed", () => {
  const bad = resp({ schedule: [{ id: 9, matchupPeriodId: 1, home: { teamId: 99, totalPoints: 10 }, away: { teamId: 10, totalPoints: 20 } }] });
  const r = parseScoreboard(bad);
  assert.equal(r.games[0].home, null, "the unknown side stays empty");
  assert.equal(r.games[0].away, "Jared");
  assert.match(r.problems[0], /Unknown ESPN team id 99/);
});

test("an explicit week overrides the response's own", () => {
  const r = parseScoreboard(resp(), 2);
  assert.equal(r.week, 2);
  assert.equal(r.games.length, 1);
});

test("game windows cover TNF, Sunday and MNF — and nothing else", () => {
  const at = (day, hour) => { const d = new Date(2026, 8, 6 + day); d.setHours(hour, 0, 0, 0); return d; };
  assert.equal(inGameWindow(at(0, 13)), true, "Sunday afternoon");
  assert.equal(inGameWindow(at(0, 9)), false, "Sunday pre-dawn is not football");
  assert.equal(inGameWindow(at(4, 20)), true, "Thursday night");
  assert.equal(inGameWindow(at(1, 21)), true, "Monday night");
  assert.equal(inGameWindow(at(2, 14)), false, "Tuesday is never a game day");
  assert.equal(inGameWindow(at(6, 13), 3), false, "early-season Saturday: no games");
  assert.equal(inGameWindow(at(6, 13), 17), true, "late-season Saturday: games");
});

test("the real 2026 preseason response yields a full week-1 slate at 0-0", () => {
  // Shape check against production data: 12 teams, 6 matchups, all zeros.
  const preseason = {
    scoringPeriodId: 0,
    status: { currentMatchupPeriod: 1 },
    schedule: Array.from({ length: 6 }, (_, i) => ({
      id: i, matchupPeriodId: 1,
      home: { teamId: i * 2 + 1, totalPoints: 0 },
      away: { teamId: i * 2 + 2, totalPoints: 0 },
      winner: "UNDECIDED",
    })),
  };
  const r = parseScoreboard(preseason);
  assert.equal(r.games.length, 6);
  assert.equal(r.problems.length, 0, "every id in a 12-team slate must resolve");
  assert.ok(r.games.every((g) => g.homeScore === 0 && !g.final));
});
