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
/**
 * Day-of-week and hour in US Central for an absolute instant.
 *
 * NOT date.getDay()/getHours(): those use the PROCESS timezone, and Cloud
 * Functions run in UTC — the `timeZone` on onSchedule only sets when the
 * job fires, not what the code inside sees. In UTC a 7:15 PM CT Thursday
 * kickoff is 00:15 Friday, so TNF (and late SNF/MNF) fell outside every
 * window and the scoreboard never polled them.
 */
function centralDayHour(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago", weekday: "short", hour: "numeric", hourCycle: "h23",
  }).formatToParts(date);
  const wd = parts.find((p) => p.type === "weekday").value;
  const hour = Number(parts.find((p) => p.type === "hour").value);
  return { day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd), hour };
}

function inGameWindow(date, week = 1) {
  const { day, hour } = centralDayHour(date); // 0 Sun … 6 Sat, US Central
  if (day === 0) return hour >= 11 && hour <= 23; // Sunday: early games → SNF
  if (day === 1) return hour >= 18 || hour <= 1; // MNF, into the small hours
  if (day === 4) return hour >= 18 || hour <= 1; // TNF
  if (day === 6) return week >= 16 && hour >= 11 && hour <= 23; // late-season Saturdays
  return false;
}

/**
 * Current-season standings from ESPN's ?view=mTeam.
 *
 * Returns { standings: [{place, teamName, record, wins, losses, ties,
 * pointsFor, pointsAgainst}], problems } — the same row shape as
 * leagueHistory/{year}.standings, so the Dashboard renders either source
 * with one component.
 *
 * Place: ESPN's own playoffSeed while it is a clean 1..N ranking (that is
 * the league's tiebreak, not ours to reinvent). If it isn't — preseason, or
 * a partial response — fall back to win% then points for. Unknown team ids
 * are reported, never guessed.
 */
function parseStandings(data) {
  const problems = [];
  const rows = [];
  for (const t of data?.teams ?? []) {
    const name = ESPN_TEAM_ID_TO_NAME[t?.id];
    if (!name) {
      problems.push(`Unknown ESPN team id ${t?.id} in standings`);
      continue;
    }
    const o = t?.record?.overall ?? {};
    const wins = Number(o.wins ?? 0);
    const losses = Number(o.losses ?? 0);
    const ties = Number(o.ties ?? 0);
    rows.push({
      teamName: name,
      wins, losses, ties,
      record: ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`,
      pointsFor: Math.round(Number(o.pointsFor ?? 0) * 100) / 100,
      pointsAgainst: Math.round(Number(o.pointsAgainst ?? 0) * 100) / 100,
      seed: Number(t?.playoffSeed ?? 0),
    });
  }

  const seeds = rows.map((r) => r.seed);
  const cleanSeeds = rows.length > 0 &&
    new Set(seeds).size === rows.length &&
    seeds.every((n) => n >= 1 && n <= rows.length);

  const pct = (r) => {
    const gp = r.wins + r.losses + r.ties;
    return gp ? (r.wins + r.ties / 2) / gp : 0;
  };
  rows.sort(cleanSeeds
    ? (a, b) => a.seed - b.seed
    : (a, b) => pct(b) - pct(a) || b.pointsFor - a.pointsFor);

  const standings = rows.map(({seed, ...r}, i) => ({place: i + 1, ...r}));
  const gamesPlayed = Math.max(0, ...rows.map((r) => r.wins + r.losses + r.ties));
  return { standings, gamesPlayed, problems: [...new Set(problems)] };
}

module.exports = { ESPN_TEAM_ID_TO_NAME, currentWeek, parseScoreboard, parseStandings, inGameWindow, centralDayHour };
