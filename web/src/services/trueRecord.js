// True Record — the POD's schedule-luck-adjusted standings.
//
// Your real record depends on who you happened to be scheduled against.
// True Record throws the schedule out: each week, every team is scored
// against ALL other teams. Top scorer that week goes 11-0, second 10-1,
// down to last at 0-11. Sum across weeks and you get the record a team
// "should" have had if it played everyone, every week.
//
// The `+/-` column is the interesting part for the show: actual wins
// minus true wins, i.e. how much a team has been carried (or robbed) by
// the schedule. Positive = luckier than they deserved.

/** Teams tied on points share the average of the W-L slots they span, so a tie can't invent wins. */
function rankWeek(entries) {
  const sorted = [...entries].sort((a, b) => b.points - a.points);
  const opponentCount = sorted.length - 1;
  const results = [];

  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1].points === sorted[i].points) j++;
    // Slots i..j are tied. A team in slot k beats (opponentCount - k) others.
    const tiedCount = j - i + 1;
    const totalWins = Array.from({ length: tiedCount }, (_, k) => opponentCount - (i + k)).reduce((a, b) => a + b, 0);
    const sharedWins = totalWins / tiedCount;
    for (let k = i; k <= j; k++) {
      results.push({
        teamName: sorted[k].teamName,
        points: sorted[k].points,
        wins: sharedWins,
        losses: opponentCount - sharedWins,
      });
    }
    i = j + 1;
  }
  return results;
}

/**
 * @param weeks - [{ week, scores: [{teamName, points}] }] — a week with
 *   fewer than 2 scores is skipped (nothing to rank against).
 * @param actualRecords - optional { [teamName]: { wins, losses } } from
 *   the real ESPN schedule, used only for the +/- luck column.
 * @returns rows sorted best true record first.
 */
export function computeTrueRecord(weeks, actualRecords = {}) {
  const totals = new Map();

  for (const { week, scores } of weeks ?? []) {
    // Number(null) and Number('') are both 0, so a missing score would
    // otherwise count as a real zero-point week — handing that team a
    // phantom loss and shifting everyone else's record with it.
    const valid = (scores ?? []).filter(
      (s) => s?.teamName && s.points !== null && s.points !== undefined && s.points !== '' && Number.isFinite(Number(s.points)),
    );
    if (valid.length < 2) continue;
    for (const r of rankWeek(valid.map((s) => ({ teamName: s.teamName, points: Number(s.points) })))) {
      const t = totals.get(r.teamName) ?? { teamName: r.teamName, wins: 0, losses: 0, pointsFor: 0, weeksPlayed: 0 };
      t.wins += r.wins;
      t.losses += r.losses;
      t.pointsFor += r.points;
      t.weeksPlayed += 1;
      totals.set(r.teamName, t);
    }
  }

  return [...totals.values()]
    .map((t) => {
      const games = t.wins + t.losses;
      const actual = actualRecords[t.teamName];
      const actualGames = actual ? actual.wins + actual.losses : 0;
      // Compare like with like: actual wins vs. what the true-record win
      // RATE would have produced over the games actually played.
      const luck = actual && games > 0 && actualGames > 0
        ? actual.wins - (t.wins / games) * actualGames
        : null;
      return {
        ...t,
        winPct: games > 0 ? t.wins / games : 0,
        avgPoints: t.weeksPlayed > 0 ? t.pointsFor / t.weeksPlayed : 0,
        actualWins: actual?.wins ?? null,
        actualLosses: actual?.losses ?? null,
        luck,
      };
    })
    .sort((a, b) => b.winPct - a.winPct || b.pointsFor - a.pointsFor);
}

/**
 * Parses pasted weekly scores. Accepts one "Team<sep>Points" pair per
 * line (tab, comma, or run of spaces), which covers copy-paste straight
 * out of the master keeper sheet or a hand-typed list.
 * Returns { scores, errors } — errors name the offending line so the
 * admin can fix a typo rather than silently dropping a team.
 */
export function parseWeekScores(text) {
  const scores = [];
  const errors = [];
  const lines = String(text ?? '').split('\n');

  lines.forEach((raw, idx) => {
    const line = raw.trim();
    if (!line) return;
    const m = line.match(/^(.*?)[\t,]\s*(-?[\d.]+)$/) || line.match(/^(.*?)\s{2,}(-?[\d.]+)$/) || line.match(/^(.+?)\s+(-?[\d.]+)$/);
    if (!m) {
      errors.push(`Line ${idx + 1}: couldn't read "${line}" — expected a team name then a score.`);
      return;
    }
    const teamName = m[1].trim();
    const points = Number(m[2]);
    if (!teamName) {
      errors.push(`Line ${idx + 1}: missing team name.`);
      return;
    }
    if (!Number.isFinite(points)) {
      errors.push(`Line ${idx + 1}: "${m[2]}" isn't a number.`);
      return;
    }
    if (scores.some((s) => s.teamName.toLowerCase() === teamName.toLowerCase())) {
      errors.push(`Line ${idx + 1}: "${teamName}" appears twice.`);
      return;
    }
    scores.push({ teamName, points });
  });

  return { scores, errors };
}
