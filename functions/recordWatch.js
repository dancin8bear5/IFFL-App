// recordWatch — the single-game record cards, and noticing when one falls.
//
// ONE definition, two callers:
//   • web/scripts/import-history.mjs builds the Trophy Room's game cards
//     from the full ESPN export with gameRecordCards();
//   • onWeeklyScoresWritten runs the same function over historyMatchups the
//     moment a new week lands, so a broken record updates its
//     leagueRecords/auto-* card that Tuesday (it used to wait for a manual
//     edit or a re-import) and posts to the League Feed.
//
// Pure. A game is one row PER TEAM: {season, week, team, opponent, pts, opp}.

const fmt = (n) => (Math.round(n * 100) / 100).toString();
const best = (list, score) => list.reduce((a, b) => (score(b) > score(a) ? b : a));

/**
 * The Trophy Room hides a card whose holder has left the league, so every
 * card names the best CURRENT member and, when a departed one did better,
 * says so in the detail line.
 */
function bestWithFormerNote(list, score, describe, activeOwners) {
  const overall = best(list, score);
  const current = list.filter((x) => activeOwners.has(x.team));
  const held = current.length ? best(current, score) : overall;
  const note = held !== overall ? ` — all-time: ${describe(overall)} (former member)` : "";
  return {held, note};
}

/** Seven cards, fixed ids, in Trophy Room order. Empty input → no cards. */
function gameRecordCards(games, activeOwners) {
  const owners = activeOwners instanceof Set ? activeOwners : new Set(activeOwners ?? []);
  const all = (games ?? []).filter((g) => Number.isFinite(g?.pts) && Number.isFinite(g?.opp));
  const vs = (g) => `vs ${g.opponent} (${fmt(g.pts)}–${fmt(g.opp)})`;
  const gameNote = (g, val) => `${g.team} ${val} (${g.season})`;
  // Win/loss comes from the SCORES, not ESPN's Winner flag: seven playoff
  // rows in the export carry Winner=W on the lower score.
  const wins = all.filter((g) => g.pts > g.opp);
  const losses = all.filter((g) => g.pts < g.opp);

  const defs = [
    ["auto-highest-single-game", "Highest Single-Game Score", "high", all, (g) => g.pts, (g) => `${fmt(g.pts)} pts`],
    ["auto-lowest-single-game", "Lowest Single-Game Score", "low", all, (g) => -g.pts, (g) => `${fmt(g.pts)} pts`],
    ["auto-biggest-blowout", "Biggest Blowout", "high", wins, (g) => g.pts - g.opp, (g) => `+${fmt(g.pts - g.opp)}`],
    ["auto-closest-margin", "Closest Margin", "high", wins, (g) => -(g.pts - g.opp), (g) => `+${fmt(g.pts - g.opp)}`],
    ["auto-most-combined", "Most Combined Points", "high", all, (g) => g.pts + g.opp, (g) => `${fmt(g.pts + g.opp)} pts`],
    ["auto-highest-score-loss", "Highest Score in a Loss", "low", losses, (g) => g.pts, (g) => `${fmt(g.pts)} pts`],
    ["auto-lowest-score-win", "Lowest Score in a Win", "high", wins, (g) => -g.pts, (g) => `${fmt(g.pts)} pts`],
  ];
  const cards = [];
  defs.forEach(([id, label, tone, list, score, value], i) => {
    if (!list.length) return;
    const {held, note} = bestWithFormerNote(list, score, (g) => gameNote(g, value(g)), owners);
    cards.push({
      id, scope: "game", label, tone, team: held.team, player: null, value: value(held),
      detail: vs(held) + note, season: held.season, week: held.week, order: i + 1,
    });
  });
  return cards;
}

/** historyMatchups docs ({season, rows:[{week, team, opponent, points, oppPoints}]}) → games. */
function gamesFromMatchupDocs(docs) {
  const out = [];
  for (const d of docs ?? []) {
    const season = Number(d?.season);
    if (!Number.isFinite(season)) continue;
    for (const r of d.rows ?? []) {
      if (!r?.team || !r.opponent) continue;
      if (!Number.isFinite(r.points) || !Number.isFinite(r.oppPoints)) continue;
      out.push({season, week: Number(r.week), team: r.team, opponent: r.opponent, pts: r.points, opp: r.oppPoints});
    }
  }
  return out;
}

/**
 * Which cards did THIS week take? Computed by comparing the book with and
 * without the week — never against the stored cards, whose strings may
 * have been hand-edited in Admin → Records.
 * Returns [{card, previous}] (previous = the card it replaced, or null).
 */
function brokenRecords(games, activeOwners, season, week) {
  const isNew = (g) => g.season === Number(season) && g.week === Number(week);
  if (!(games ?? []).some(isNew)) return [];
  const before = new Map(gameRecordCards(games.filter((g) => !isNew(g)), activeOwners).map((c) => [c.id, c]));
  return gameRecordCards(games, activeOwners)
    .filter((c) => c.season === Number(season) && c.week === Number(week))
    .map((card) => ({card, previous: before.get(card.id) ?? null}));
}

/** The twelve teams playing the given season — "current members" for the cards. */
function ownersOfSeason(games, season) {
  return new Set((games ?? []).filter((g) => g.season === Number(season)).map((g) => g.team));
}

module.exports = {fmt, gameRecordCards, gamesFromMatchupDocs, brokenRecords, ownersOfSeason};
