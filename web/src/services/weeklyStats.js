// weeklyStats — in-season scoring math, computed from the league-readable
// weeklyScores/{season} store.
//
// Deliberately does NOT compute all-play or True Record. Those are the
// POD's reveal and live in services/trueRecord.js behind the POD gate;
// this module only does things every manager can already work out from
// the ESPN scoreboard.
//
// The recurring hazard in here is the missing score. Number(null),
// Number(undefined) and Number('') are all 0, so a team that simply
// wasn't entered for a week would otherwise land as a real zero-point
// week — dragging its average down and pulling the league median with
// it. Every entry point filters to finite numbers first.

/** True only for a value that is a real, finite score. */
const isScore = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v))

/**
 * Normalise the stored `{ "1": [...], "2": [...] }` map into a
 * week-ascending array, dropping unusable weeks.
 * @param weeksMap - the `weeks` field of a weeklyScores doc
 * @returns [{ week, scores: [{teamName, points}] }]
 */
export function weeksFromMap(weeksMap) {
  return Object.entries(weeksMap ?? {})
    .map(([w, scores]) => ({
      week: Number(w),
      scores: (scores ?? [])
        .filter((s) => s?.teamName && isScore(s.points))
        .map((s) => ({ teamName: s.teamName, points: Number(s.points) })),
    }))
    .filter((w) => Number.isFinite(w.week) && w.scores.length > 0)
    .sort((a, b) => a.week - b.week)
}

/** Median of a numeric array. Even counts average the two middle values. */
export function median(nums) {
  const s = [...nums].sort((a, b) => a - b)
  if (s.length === 0) return null
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/**
 * Standard competition ranking (1,2,2,4) over descending values.
 * @param entries - [{ key, value }]
 * @returns Map key → rank
 */
export function competitionRank(entries) {
  const sorted = [...entries].sort((a, b) => b.value - a.value)
  const ranks = new Map()
  let rank = 0
  sorted.forEach((e, i) => {
    // Only advance the rank when the value actually changes, so ties
    // share a rank and the next distinct value skips the slots used up.
    if (i === 0 || e.value !== sorted[i - 1].value) rank = i + 1
    ranks.set(e.key, rank)
  })
  return ranks
}

/**
 * Per-team season averages across every week entered.
 * @returns [{ teamName, total, weeksPlayed, avg }] sorted best average first
 */
export function teamAverages(weeks) {
  const totals = new Map()
  for (const { scores } of weeks) {
    for (const { teamName, points } of scores) {
      const t = totals.get(teamName) ?? { teamName, total: 0, weeksPlayed: 0 }
      t.total += points
      t.weeksPlayed += 1
      totals.set(teamName, t)
    }
  }
  return [...totals.values()]
    .map((t) => ({ ...t, avg: t.weeksPlayed > 0 ? t.total / t.weeksPlayed : 0 }))
    .sort((a, b) => b.avg - a.avg)
}

/**
 * Everything the in-season Dashboard module needs for one team.
 *
 * @param weeks - output of weeksFromMap
 * @param teamName - the viewer's team; may be '' (a signed-in member with
 *   no team assigned yet), in which case the league context still
 *   computes and the personal fields come back null.
 */
export function computeSeasonScoring(weeks, teamName) {
  const points = weeks.map((w) => {
    const all = w.scores.map((s) => s.points)
    const mineEntry = w.scores.find((s) => s.teamName === teamName)
    return {
      week: w.week,
      mine: mineEntry ? mineEntry.points : null,
      // A single-team week has no meaningful spread — leave the league
      // context null rather than drawing a band of zero width that
      // looks like real agreement.
      median: all.length >= 2 ? median(all) : null,
      high: all.length >= 2 ? Math.max(...all) : null,
      low: all.length >= 2 ? Math.min(...all) : null,
      teamCount: all.length,
    }
  })

  const averages = teamAverages(weeks)
  const ranks = competitionRank(averages.map((t) => ({ key: t.teamName, value: t.avg })))
  const mine = averages.find((t) => t.teamName === teamName) ?? null
  const played = points.filter((p) => p.mine !== null)

  const best = played.length > 0
    ? played.reduce((a, b) => (b.mine > a.mine ? b : a))
    : null
  const worst = played.length > 0
    ? played.reduce((a, b) => (b.mine < a.mine ? b : a))
    : null

  return {
    points,
    averages,
    weekCount: weeks.length,
    avgPPG: mine ? mine.avg : null,
    rank: mine ? ranks.get(teamName) : null,
    teamCount: averages.length,
    best: best ? { week: best.week, points: best.mine } : null,
    worst: worst ? { week: worst.week, points: worst.mine } : null,
    leagueAvg: averages.length > 0
      ? averages.reduce((sum, t) => sum + t.avg, 0) / averages.length
      : null,
  }
}

/**
 * The most recent week's scoreboard, ranked. Powers the "latest week"
 * bar chart.
 * @returns { week, rows: [{teamName, points, rank}] } or null if no weeks
 */
export function latestWeek(weeks) {
  if (weeks.length === 0) return null
  const w = weeks[weeks.length - 1]
  const ranks = competitionRank(w.scores.map((s) => ({ key: s.teamName, value: s.points })))
  return {
    week: w.week,
    rows: [...w.scores]
      .sort((a, b) => b.points - a.points)
      .map((s) => ({ ...s, rank: ranks.get(s.teamName) })),
  }
}

/**
 * Parses pasted W-L records, one team per line:
 *   Jared 10-4
 *   Bill, 9-4-1
 *   M. Zurek   8-6
 *
 * Same shape as the weekly-score paste box, because it's the same job and
 * the same copy-paste source. Returns { records, errors } — errors name
 * the offending line so a typo gets fixed rather than silently dropped.
 */
export function parseRecordLines(text) {
  const records = {}
  const errors = []

  String(text ?? '').split('\n').forEach((raw, idx) => {
    const line = raw.trim()
    if (!line) return
    const m = line.match(/^(.*?)[\t,]\s*(\d+)-(\d+)(?:-(\d+))?$/)
      || line.match(/^(.*?)\s+(\d+)-(\d+)(?:-(\d+))?$/)
    if (!m) {
      errors.push(`Line ${idx + 1}: couldn't read "${line}" — expected a team name then a record like 10-4.`)
      return
    }
    const teamName = m[1].trim()
    if (!teamName) { errors.push(`Line ${idx + 1}: missing team name.`); return }
    if (records[teamName]) { errors.push(`Line ${idx + 1}: "${teamName}" appears twice.`); return }
    records[teamName] = {
      wins: Number(m[2]),
      losses: Number(m[3]),
      ties: m[4] === undefined ? 0 : Number(m[4]),
    }
  })

  return { records, errors }
}
