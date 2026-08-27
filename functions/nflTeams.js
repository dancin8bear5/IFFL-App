// nflTeams — ESPN's NFL franchise id → the abbreviation this app displays.
//
// Why this exists: `players.nflTeam` had three conventions living in it at
// once — 184 abbreviations from the original bulk load, 24 full names from
// the 2026 rookie seed ("Jeremiyah Love → Arizona Cardinals" sitting beside
// "Dak Prescott → DAL"), plus blanks and a stray "FA". Nothing owned the
// field, so every writer picked its own format.
//
// The league feed carries `pro_team_id` for every rostered player, which is
// ESPN's franchise id — stable, complete, and already arriving every five
// minutes. Mapping it here makes nflTeam a synced field like ownership and
// prices: self-healing, and impossible to reintroduce drift into.
//
// Ids verified against ESPN's own team list (site.api.espn.com). One
// deliberate divergence: ESPN abbreviates Washington "WSH"; this app has
// always used "WAS" and 184 documents already say so. Ours wins — matching
// ESPN there would rewrite every Washington player to no benefit.

const PRO_TEAM_ID_TO_ABBREV = {
  1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN",
  8: "DET", 9: "GB", 10: "TEN", 11: "IND", 12: "KC", 13: "LV", 14: "LAR",
  15: "MIA", 16: "MIN", 17: "NE", 18: "NO", 19: "NYG", 20: "NYJ", 21: "PHI",
  22: "ARI", 23: "PIT", 24: "LAC", 25: "SF", 26: "SEA", 27: "TB",
  28: "WAS", // ESPN says WSH; this app has always said WAS
  29: "CAR", 30: "JAX", 33: "BAL", 34: "HOU",
};

/**
 * Full NFL team name → abbreviation, for the values already sitting in the
 * database from the rookie seed. Only needed to normalize what is there;
 * new writes come from pro_team_id.
 */
const FULL_NAME_TO_ABBREV = {
  "arizona cardinals": "ARI", "atlanta falcons": "ATL", "baltimore ravens": "BAL",
  "buffalo bills": "BUF", "carolina panthers": "CAR", "chicago bears": "CHI",
  "cincinnati bengals": "CIN", "cleveland browns": "CLE", "dallas cowboys": "DAL",
  "denver broncos": "DEN", "detroit lions": "DET", "green bay packers": "GB",
  "houston texans": "HOU", "indianapolis colts": "IND", "jacksonville jaguars": "JAX",
  "kansas city chiefs": "KC", "las vegas raiders": "LV", "los angeles chargers": "LAC",
  "los angeles rams": "LAR", "miami dolphins": "MIA", "minnesota vikings": "MIN",
  "new england patriots": "NE", "new orleans saints": "NO", "new york giants": "NYG",
  "new york jets": "NYJ", "philadelphia eagles": "PHI", "pittsburgh steelers": "PIT",
  "san francisco 49ers": "SF", "seattle seahawks": "SEA", "tampa bay buccaneers": "TB",
  "tennessee titans": "TEN", "washington commanders": "WAS",
};

const VALID = new Set(Object.values(PRO_TEAM_ID_TO_ABBREV));

/**
 * The abbreviation for a feed player, or null.
 *
 * pro_team_id 0 means "no NFL team" — a genuinely unsigned player. That is
 * null here, deliberately not the string "FA" that one row currently
 * carries: whether someone is an NFL free agent is a different fact from
 * which team he plays for, and cramming it into this field is what made it
 * unreliable to read.
 */
function abbrevFromProTeamId(id) {
  if (id == null) return null;
  return PRO_TEAM_ID_TO_ABBREV[Number(id)] ?? null;
}

/**
 * Normalize whatever is already stored — an abbreviation passes through, a
 * full name converts, anything unrecognized returns null rather than being
 * guessed at. Used to decide whether a stored value needs correcting.
 */
function normalizeNflTeam(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s || s.toUpperCase() === "FA") return null;
  if (VALID.has(s.toUpperCase())) return s.toUpperCase();
  return FULL_NAME_TO_ABBREV[s.toLowerCase()] ?? null;
}

module.exports = { PRO_TEAM_ID_TO_ABBREV, FULL_NAME_TO_ABBREV, abbrevFromProTeamId, normalizeNflTeam };
