const test = require("node:test");
const assert = require("node:assert/strict");
const { parseScoreboard, parseStandings, parseWeeklyScores, recordsFromStandings, currentWeek, inGameWindow, ESPN_TEAM_ID_TO_NAME } = require("./espnScores");

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

test("the window is all of Sunday and Monday 7pm–midnight, and nothing else", () => {
  // Absolute instants in US Central (Sep 2026 = CDT, UTC-5), so this passes
  // in any process timezone — CI and Cloud Functions both run in UTC.
  const at = (day, hour) => new Date(Date.UTC(2026, 8, 6 + day, hour + 5));
  assert.equal(inGameWindow(at(0, 13)), true, "Sunday afternoon");
  assert.equal(inGameWindow(at(0, 4)), true, "Sunday is unbounded, by request");
  assert.equal(inGameWindow(at(0, 23)), true, "Sunday night");
  assert.equal(inGameWindow(at(1, 19)), true, "Monday 7pm, kickoff");
  assert.equal(inGameWindow(at(1, 23)), true, "Monday 11pm, still in");
  assert.equal(inGameWindow(at(1, 18)), false, "Monday 6pm is before the window");
  // The three the schedule gives up, asserted so nobody reads their absence
  // as an oversight: games do happen at all of these.
  assert.equal(inGameWindow(at(2, 0)), false, "Monday game past midnight is Tuesday, and frozen");
  assert.equal(inGameWindow(at(4, 20)), false, "Thursday night football no longer polls");
  assert.equal(inGameWindow(at(6, 13)), false, "late-season Saturday no longer polls");
  assert.equal(inGameWindow(at(2, 14)), false, "Tuesday is never a game day");
  assert.equal(inGameWindow(at(5, 20)), false, "Friday is never a game day");
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

// ── Standings ───────────────────────────────────────────────
const team = (id, w, l, pf, seed, t = 0) => ({
  id, playoffSeed: seed,
  record: { overall: { wins: w, losses: l, ties: t, pointsFor: pf, pointsAgainst: 100 } },
});

test("standings follow ESPN's playoffSeed when it is a clean ranking", () => {
  const { standings, problems, gamesPlayed } = parseStandings({ teams: [
    team(10, 2, 1, 300.456, 2), team(6, 3, 0, 280, 1), team(5, 0, 3, 250, 3),
  ] });
  assert.deepEqual(standings.map((s) => s.teamName), ["Bill", "Jared", "M. Zurek"]);
  assert.deepEqual(standings.map((s) => s.place), [1, 2, 3]);
  assert.equal(standings[1].record, "2-1");
  assert.equal(standings[1].pointsFor, 300.46);
  assert.equal(gamesPlayed, 3);
  assert.equal(problems.length, 0);
  assert.equal("seed" in standings[0], false, "internal seed field is not written");
});

test("without clean seeds, rank by win% then points for", () => {
  const { standings } = parseStandings({ teams: [
    team(10, 1, 1, 200, 0), team(6, 1, 1, 250, 0), team(5, 2, 0, 150, 0),
  ] });
  assert.deepEqual(standings.map((s) => s.teamName), ["M. Zurek", "Bill", "Jared"]);
});

test("ties show in the record and count half a win", () => {
  const { standings } = parseStandings({ teams: [team(10, 1, 0, 100, 0, 1), team(6, 1, 1, 500, 0)] });
  assert.equal(standings[0].teamName, "Jared");
  assert.equal(standings[0].record, "1-0-1");
});

test("an unknown ESPN team id is reported, never guessed", () => {
  const { standings, problems } = parseStandings({ teams: [team(99, 1, 0, 100, 1), team(10, 0, 1, 90, 2)] });
  assert.deepEqual(standings.map((s) => s.teamName), ["Jared"]);
  assert.match(problems[0], /99/);
});

test("empty response → empty standings, no throw", () => {
  assert.deepEqual(parseStandings({}).standings, []);
  assert.deepEqual(parseStandings(null).standings, []);
});

test("a night game counts by its CENTRAL day, not the UTC one it falls into", () => {
  // The bug this guards: Cloud Functions run in UTC, and date.getDay() there
  // reads a 9:30 PM Central Sunday as Monday — which is how night games fell
  // outside every window until Sep 25. Both instants below are "tomorrow" in
  // UTC and must still be judged as Sunday and Monday.
  const snf = new Date("2026-09-14T02:30:00Z"); // Sun Sep 13, 9:30 PM CDT
  assert.equal(inGameWindow(snf), true, "Sunday night, already Monday in UTC");
  const mnf = new Date("2026-09-15T03:00:00Z"); // Mon Sep 14, 10:00 PM CDT
  assert.equal(inGameWindow(mnf), true, "Monday night, already Tuesday in UTC");
  const tueMorning = new Date("2026-09-15T14:00:00Z"); // Tue 9 AM CDT
  assert.equal(inGameWindow(tueMorning), false);
});

// ── Weekly scores (agent #2) ────────────────────────────────
const mu = (wk, h, hp, a, ap, winner = "HOME", tier) => ({
  matchupPeriodId: wk, winner, ...(tier ? { playoffTierType: tier } : {}),
  home: { teamId: h, totalPoints: hp }, away: { teamId: a, totalPoints: ap },
});

test("complete weeks come out in the weeklyScores shape", () => {
  const r = parseWeeklyScores({ schedule: [
    mu(1, 10, 101.234, 6, 99), mu(1, 5, 80, 2, 120, "AWAY"),
    mu(2, 10, 90, 5, 91, "AWAY"), mu(2, 6, 0, 2, 0, "UNDECIDED"),
  ] });
  assert.deepEqual(r.completeWeeks, [1]);
  assert.deepEqual(Object.keys(r.weeks), ["1"]);
  assert.equal(r.weeks["1"].length, 4);
  assert.deepEqual(r.weeks["1"].find((s) => s.teamName === "Jared"), { teamName: "Jared", points: 101.23 });
});

test("a week with ONE open game is left out entirely, never half-written", () => {
  const r = parseWeeklyScores({ schedule: [mu(3, 10, 100, 6, 90), mu(3, 5, 50, 2, 40, "UNDECIDED")] });
  assert.deepEqual(r.completeWeeks, []);
  assert.deepEqual(r.weeks, {});
});

test("playoff periods are excluded", () => {
  const r = parseWeeklyScores({ schedule: [mu(15, 10, 100, 6, 90, "HOME", "WINNERS_BRACKET"), mu(14, 10, 1, 6, 2, "AWAY", "NONE")] });
  assert.deepEqual(r.completeWeeks, [14]);
});

test("unknown team ids are reported, and the rest of the week survives", () => {
  const r = parseWeeklyScores({ schedule: [mu(1, 99, 100, 6, 90)] });
  assert.match(r.problems[0], /99/);
  assert.deepEqual(r.weeks["1"], [{ teamName: "Bill", points: 90 }]);
});

test("a missing score holds the week back", () => {
  const r = parseWeeklyScores({ schedule: [{ matchupPeriodId: 1, winner: "HOME", home: { teamId: 10 }, away: { teamId: 6, totalPoints: 1 } }] });
  assert.deepEqual(r.completeWeeks, []);
  assert.match(r.problems[0], /No score for Jared/);
});

test("records come from standings rows", () => {
  const { standings } = parseStandings({ teams: [team(10, 2, 1, 300, 1), team(6, 1, 2, 250, 2, 0)] });
  assert.deepEqual(recordsFromStandings(standings), { Jared: { wins: 2, losses: 1, ties: 0 }, Bill: { wins: 1, losses: 2, ties: 0 } });
});
