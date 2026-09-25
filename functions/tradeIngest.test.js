const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveEspnTeam, validatePayload, matchPlayers, pickSides } = require("./tradeIngest.js");

test("resolveEspnTeam matches case-insensitively and trims whitespace", () => {
  assert.equal(resolveEspnTeam("bill pony club"), "Bill");
  assert.equal(resolveEspnTeam("Bill Pony Club"), "Bill");
  assert.equal(resolveEspnTeam("  Shoot the Moon: IV  "), "Jared");
});

test("resolveEspnTeam returns null for an unrecognized name", () => {
  assert.equal(resolveEspnTeam("Some Random Team Nobody Owns"), null);
  assert.equal(resolveEspnTeam(""), null);
  assert.equal(resolveEspnTeam(undefined), null);
});

test("all 12 ESPN team names from the Keeper Master p17 map resolve", () => {
  const names = [
    "Cinderella Story", "Horner Park Johnson-Rods", "bill pony club",
    "Aussie Rookie Ramblers", "Cream Of Wheaton", "Allegiant Pots N Pans",
    "Wheaton Creampeyes", "Shoot the Moon: IV", "The Mojave Miracles",
    "Meta Knights", "The Replacements", "River Forest Republicans",
  ];
  for (const n of names) assert.ok(resolveEspnTeam(n), `expected ${n} to resolve`);
});

test("validatePayload rejects a missing sourceId", () => {
  const r = validatePayload({ moves: [{ player: "Bob", fromEspnTeam: "Bill Pony Club", toEspnTeam: "Meta Knights" }] });
  assert.equal(r.ok, false);
  assert.match(r.error, /sourceId/);
});

test("validatePayload rejects empty/missing moves", () => {
  assert.equal(validatePayload({ sourceId: "x", moves: [] }).ok, false);
  assert.equal(validatePayload({ sourceId: "x" }).ok, false);
  assert.equal(validatePayload(null).ok, false);
});

test("validatePayload rejects an unrecognized ESPN team name", () => {
  const r = validatePayload({
    sourceId: "x",
    moves: [{ player: "Bob", fromEspnTeam: "Not A Real Team", toEspnTeam: "Meta Knights" }],
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /fromEspnTeam/);
});

test("validatePayload rejects a move where from and to resolve to the same team", () => {
  const r = validatePayload({
    sourceId: "x",
    moves: [{ player: "Bob", fromEspnTeam: "bill pony club", toEspnTeam: "Bill Pony Club" }],
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /same team/);
});

test("validatePayload resolves ESPN names to master team names on success", () => {
  const r = validatePayload({
    sourceId: "gmail-123",
    moves: [
      { player: "Justin Jefferson", fromEspnTeam: "bill pony club", toEspnTeam: "Shoot the Moon: IV" },
      { player: "Patrick Mahomes", fromEspnTeam: "Shoot the Moon: IV", toEspnTeam: "bill pony club" },
    ],
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.moves, [
    { player: "Justin Jefferson", fromTeam: "Bill", toTeam: "Jared" },
    { player: "Patrick Mahomes", fromTeam: "Jared", toTeam: "Bill" },
  ]);
});

const ROSTER = [
  { id: "p1", name: "Justin Jefferson", teamName: "Bill" },
  { id: "p2", name: "Patrick Mahomes", teamName: "Jared" },
  { id: "p3", name: "Josh Allen", teamName: "M. Zurek" },
  { id: "p4", name: "Josh Allen", teamName: "M. Zurek" }, // deliberate duplicate name, same team
];

test("matchPlayers resolves a clean 1:1 name+team match", () => {
  const moves = [{ player: "Justin Jefferson", fromTeam: "Bill", toTeam: "Jared" }];
  const r = matchPlayers(moves, ROSTER);
  assert.equal(r.ok, true);
  assert.equal(r.resolved[0].assetId, "p1");
  assert.equal(r.problems.length, 0);
});

test("matchPlayers matches case-insensitively", () => {
  const moves = [{ player: "justin jefferson", fromTeam: "Bill", toTeam: "Jared" }];
  const r = matchPlayers(moves, ROSTER);
  assert.equal(r.ok, true);
  assert.equal(r.resolved[0].assetId, "p1");
});

test("matchPlayers flags a player not found on the stated team", () => {
  const moves = [{ player: "Nobody Here", fromTeam: "Bill", toTeam: "Jared" }];
  const r = matchPlayers(moves, ROSTER);
  assert.equal(r.ok, false);
  assert.equal(r.resolved.length, 0);
  assert.match(r.problems[0].reason, /not found/);
});

test("matchPlayers flags an ambiguous duplicate name on the same team", () => {
  const moves = [{ player: "Josh Allen", fromTeam: "M. Zurek", toTeam: "Bill" }];
  const r = matchPlayers(moves, ROSTER);
  assert.equal(r.ok, false);
  assert.match(r.problems[0].reason, /ambiguous/);
});

test("matchPlayers only matches within the stated fromTeam, not league-wide", () => {
  // Justin Jefferson really is on Bill, not Jared — asking for him "from Jared" must fail
  const moves = [{ player: "Justin Jefferson", fromTeam: "Jared", toTeam: "Bill" }];
  const r = matchPlayers(moves, ROSTER);
  assert.equal(r.ok, false);
  assert.match(r.problems[0].reason, /not found/);
});

test("matchPlayers resolves what it can and reports the rest — partial trades never silently apply", () => {
  const moves = [
    { player: "Justin Jefferson", fromTeam: "Bill", toTeam: "Jared" }, // clean
    { player: "Nobody Here", fromTeam: "Jared", toTeam: "Bill" },       // problem
  ];
  const r = matchPlayers(moves, ROSTER);
  assert.equal(r.ok, false); // overall not ok — caller must not apply a partial trade
  assert.equal(r.resolved.length, 1);
  assert.equal(r.problems.length, 1);
});

test("pickSides labels the two teams from a normal 2-team trade", () => {
  const resolved = [
    { fromTeam: "Bill", toTeam: "Jared" },
    { fromTeam: "Jared", toTeam: "Bill" },
  ];
  assert.deepEqual(pickSides(resolved), { proposingTeamName: "Bill", receivingTeamName: "Jared" });
});

test("pickSides handles a lopsided trade (2-for-1, all moves from the same team)", () => {
  const resolved = [
    { fromTeam: "Bill", toTeam: "Jared" },
    { fromTeam: "Bill", toTeam: "Jared" },
  ];
  assert.deepEqual(pickSides(resolved), { proposingTeamName: "Bill", receivingTeamName: "Jared" });
});
