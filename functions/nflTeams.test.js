const test = require("node:test");
const assert = require("node:assert/strict");
const { PRO_TEAM_ID_TO_ABBREV, abbrevFromProTeamId, normalizeNflTeam } = require("./nflTeams");

test("all 32 NFL franchises map to distinct abbreviations", () => {
  const vals = Object.values(PRO_TEAM_ID_TO_ABBREV);
  assert.equal(vals.length, 32);
  assert.equal(new Set(vals).size, 32);
});

test("pro_team_id resolves, and 0 means no NFL team", () => {
  assert.equal(abbrevFromProTeamId(12), "KC");
  assert.equal(abbrevFromProTeamId(33), "BAL");
  assert.equal(abbrevFromProTeamId(22), "ARI");
  assert.equal(abbrevFromProTeamId(0), null, "unsigned is null, not a team");
  assert.equal(abbrevFromProTeamId(null), null);
  assert.equal(abbrevFromProTeamId(999), null, "an unknown id is never guessed");
});

test("Washington keeps this app's WAS, not ESPN's WSH", () => {
  // 184 documents already say WAS; matching ESPN would rewrite them all.
  assert.equal(abbrevFromProTeamId(28), "WAS");
});

test("normalization folds the rookie seed's full names into abbreviations", () => {
  assert.equal(normalizeNflTeam("Kansas City Chiefs"), "KC");
  assert.equal(normalizeNflTeam("Arizona Cardinals"), "ARI");
  assert.equal(normalizeNflTeam("Las Vegas Raiders"), "LV");
  assert.equal(normalizeNflTeam("San Francisco 49ers"), "SF");
  assert.equal(normalizeNflTeam("Washington Commanders"), "WAS");
});

test("an abbreviation passes through; junk and the FA marker become null", () => {
  assert.equal(normalizeNflTeam("KC"), "KC");
  assert.equal(normalizeNflTeam("kc"), "KC");
  assert.equal(normalizeNflTeam("FA"), null, "NFL free agency is not a team");
  assert.equal(normalizeNflTeam(""), null);
  assert.equal(normalizeNflTeam(null), null);
  assert.equal(normalizeNflTeam("Bears (Rawr)"), null, "unrecognized is null, never guessed");
});

test("every full-name entry maps to a real franchise abbreviation", () => {
  const { FULL_NAME_TO_ABBREV } = require("./nflTeams");
  const valid = new Set(Object.values(PRO_TEAM_ID_TO_ABBREV));
  const names = Object.keys(FULL_NAME_TO_ABBREV);
  assert.equal(names.length, 32, "all 32 teams covered");
  for (const n of names) assert.ok(valid.has(FULL_NAME_TO_ABBREV[n]), `${n} → unknown abbrev`);
});
