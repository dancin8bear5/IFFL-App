// espnScores — pure parsing for ESPN's live scoreboard.
//
// Source: the same undocumented v3 endpoint ESPN's own site uses,
// ?view=mMatchupScore, public for this league (no cookies, no key). No
// scraping, no extension.
//
// Pure by design: an ESPN response goes in, scoreboard rows come out. The
// fetching and the Firestore write live in index.js so this tests offline.

/**
 * ESPN fantasy team id → our master team name.
 *
 * Derived from the league feed's espn_team_id (which is the authority) and
 * baked in here rather than fetched: ESPN team IDS are stable for the life
 * of a league, unlike team NAMES, which owners rename freely. Same reasoning
 * and same shape as ESPN_TEAM_MAP in tradeIngest.js.
 */
const ESPN_TEAM_ID_TO_NAME = {
  1: "Faybik",    // Allegiant Pots N Pans
  2: "Jason",     // The Battle Cats
  3: "Dugan",     // Cream Of Wheaton
  4: "Wayne",     // River Forest Republicans
  5: "M. Zurek",  // Meta Knights
  6: "Bill",      // bill pony club
  7: "Abad",      // Horner Park Johnson-Rods
  8: "Ryan",      // The Replacements
  9: "Cantone",   // Aussie Rookie Ramblers
  10: "Jared",    // Shoot the Moon: IV
  11: "Foley",    // Wheaton Creampeyes
  12: "A. Zurek", // Cinderella Story
};

/**
 * Which week to show. ESPN reports `scoringPeriodId` (0 in the preseason)
 * and `status.currentMatchupPeriod`. Prefer the live scoring period once
 * games have started; fall back to the matchup period, then week 1 — so
 * this never returns 0 and asks for a week that cannot exist.
 */
function currentWeek(data) {
  const sp = Number(data?.scoringPeriodId ?? 0);
  if (sp > 0) return sp;
  const mp = Number(data?.status?.currentMatchupPeriod ?? 0);
  return mp > 0 ? mp : 1;
}

/**
 * Scoreboard rows for one week.
 *
 * Returns { week, games: [{home, away, homeScore, awayScore, ...}], problems }.
 * A matchup naming a team id we don't know is reported, never guessed —
 * same no-guess rule as every other ingest here. A bye (one side absent)
 * is legal and comes back with that side null.
 */
function parseScoreboard(data, week) {
  const wk = week ?? currentWeek(data);
  const games = [];
  const problems = [];

  for (const m of data?.schedule ?? []) {
    if (Number(m?.matchupPeriodId) !== Number(wk)) continue;

    const side = (s) => {
      if (!s || s.teamId == null) return null;
      const name = ESPN_TEAM_ID_TO_NAME[s.teamId];
      if (!name) {
        problems.push(`Unknown ESPN team id ${s.teamId} in week ${wk}`);
        return null;
      }
      return { team: name, score: Number(s.totalPoints ?? 0) };
    };

    const home = side(m.home);
    const away = side(m.away);
    if (!home && !away) continue;

    games.push({
      matchupId: m.id ?? null,
      home: home?.team ?? null,
      away: away?.team ?? null,
      homeScore: home?.score ?? null,
      awayScore: away?.score ?? null,
      // ESPN marks a finished matchup with winner 'HOME'/'AWAY'; 'UNDECIDED'
      // covers both not-yet-played and in-progress, so it is not a "live"
      // signal on its own — the scores moving is.
      winner: m.winner && m.winner !== "UNDECIDED" ? m.winner : null,
      final: !!(m.winner && m.winner !== "UNDECIDED"),
    });
  }

  return { week: wk, games, problems: [...new Set(problems)] };
}

/**
 * Is it worth polling right now?
 *
 * NFL games run Thursday night, Sunday, and Monday night (plus Saturdays
 * from Week 16). Outside those windows the scoreboard cannot change, so the
 * poller returns early instead of burning a run every three minutes for
 * five months. Hours are US Central, matching every other schedule here.
 */
function inGameWindow(date, week = 1) {
  const day = date.getDay(); // 0 Sun … 6 Sat
  const hour = date.getHours();
  if (day === 0) return hour >= 11 && hour <= 23; // Sunday: early games → SNF
  if (day === 1) return hour >= 18 || hour <= 1; // MNF, into the small hours
  if (day === 4) return hour >= 18 || hour <= 1; // TNF
  if (day === 6) return week >= 16 && hour >= 11 && hour <= 23; // late-season Saturdays
  return false;
}

module.exports = { ESPN_TEAM_ID_TO_NAME, currentWeek, parseScoreboard, inGameWindow };
