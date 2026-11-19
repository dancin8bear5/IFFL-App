// weeklyRecap — pure helpers for onWeeklyScoresWritten (functions/index.js).
//
// Weekly scores used to be fetched from ESPN by the pollWeeklyScores Cloud
// Function, which then drafted the recap from that same API response. Since
// Nov 2026 the Mac's Tuesday scrape (web/scripts/scrape-espn-week.mjs) is the
// only writer of weeklyScores/{season}, so the recap is drafted from what the
// scrape already stored: historyMatchups/{season} for the games and
// espnStandings/{season} for the table. No ESPN call here at all.

/** Highest week number present in a weeklyScores `weeks` map; 0 if none. */
function latestWeek(weeks) {
  const ns = Object.entries(weeks ?? {})
    .filter(([, scores]) => Array.isArray(scores) && scores.length > 0)
    .map(([k]) => Number(k))
    .filter((n) => Number.isInteger(n) && n > 0);
  return ns.length ? Math.max(...ns) : 0;
}

/**
 * historyMatchups rows (one per TEAM per game: {week, team, opponent, points,
 * oppPoints}) → the games shape leagueNotes.recapFacts reads:
 * [{home, away, homeScore, awayScore, final: true}], one per GAME.
 *
 * "home" is simply the alphabetically-first team — the stored rows carry no
 * home/away, and recapFacts only ever uses the pair. A row with a missing
 * score or name is skipped, never guessed.
 */
function gamesFromMatchupRows(rows, week) {
  const seen = new Set();
  const games = [];
  for (const r of rows ?? []) {
    if (Number(r?.week) !== Number(week)) continue;
    if (!r.team || !r.opponent) continue;
    if (!Number.isFinite(r.points) || !Number.isFinite(r.oppPoints)) continue;
    const [home, away] = [r.team, r.opponent].sort((a, b) => a.localeCompare(b));
    const key = `${home}|${away}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const homeIsRow = home === r.team;
    games.push({
      home, away,
      homeScore: homeIsRow ? r.points : r.oppPoints,
      awayScore: homeIsRow ? r.oppPoints : r.points,
      final: true,
    });
  }
  return games.sort((a, b) => a.home.localeCompare(b.home));
}

/**
 * Should a write to weeklyScores/{season} draft a recap?
 * Only when a NEW week appeared (latest week went up) in the ACTIVE season —
 * a re-scrape of the same week, a history import of an old season, or a
 * records-only change must not redraft a note the commissioner may be editing.
 */
function newWeekLanded({season, activeSeason, beforeWeeks, afterWeeks}) {
  if (Number(season) !== Number(activeSeason)) return 0;
  const before = latestWeek(beforeWeeks);
  const after = latestWeek(afterWeeks);
  return after > before ? after : 0;
}

module.exports = {latestWeek, gamesFromMatchupRows, newWeekLanded};
