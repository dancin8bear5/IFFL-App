// standingsReel — the data behind the Dashboard's animated Standings card.
//
// Pure functions only: no React, no Firestore. The card replays the season
// week by week (bars = running points-for), then re-sorts into the real
// table, draws the playoff cut, and settles into the same table the
// Dashboard has always shown — plus a sparkline, luck and this week's game.
//
// Sources, both already synced by the app:
//   standings     espnStandings/{season} (pollEspnStandings) — the ORDER
//                 shown at the end is always this, never recomputed here.
//   weeklyScores  weeklyScores/{season}.weeks — { "1": [{teamName, points}] }
//
// The race is ranked on cumulative points because that's all the weekly
// docs carry: they have each team's score, not who they played, so a
// week-by-week W-L can't be rebuilt honestly. Records appear only at the
// standings beat, from ESPN.

export const PLAYOFF_SPOTS = 6

/** "3-0" | "3-0-1" → { wins, losses, ties } (bad input → zeros). */
export function parseRecord(rec) {
  const m = String(rec ?? '').match(/^(\d+)-(\d+)(?:-(\d+))?$/)
  return m ? { wins: +m[1], losses: +m[2], ties: +(m[3] ?? 0) } : { wins: 0, losses: 0, ties: 0 }
}

/** Completed week numbers present in the weekly doc, ascending. */
export function weekNumbers(weeklyScores) {
  return Object.keys(weeklyScores ?? {})
    .map(Number)
    .filter((w) => Number.isInteger(w) && w > 0 && Array.isArray(weeklyScores[w]) && weeklyScores[w].length)
    .sort((a, b) => a - b)
}

/**
 * Everything the card animates, computed once.
 *
 * @param standings     [{ teamName, place, record, pointsFor }]
 * @param weeklyScores  { [week]: [{ teamName, points }] }
 * @returns null when there are no standings to show (the section then
 *          renders nothing, exactly as before).
 */
export function buildReel(standings, weeklyScores) {
  if (!Array.isArray(standings) || !standings.length) return null
  const table = [...standings].sort((a, b) => a.place - b.place)
  const teams = table.map((s) => s.teamName)
  const weeks = weekNumbers(weeklyScores)

  // points[team][i] for weeks[i]; a team missing from a week scores null.
  const points = Object.fromEntries(teams.map((t) => [t, weeks.map((w) => {
    const row = weeklyScores[w].find((r) => r.teamName === t)
    return row && Number.isFinite(row.points) ? row.points : null
  })]))
  const cumulative = Object.fromEntries(teams.map((t) => {
    let run = 0
    return [t, points[t].map((p) => (run += p ?? 0))]
  }))

  // Rank snapshots: kickoff (alphabetical), one per week (cumulative PF),
  // then the real table. rank[k][team] = 0-based row.
  const toRank = (order) => Object.fromEntries(order.map((t, i) => [t, i]))
  const frames = [toRank([...teams].sort((a, b) => a.localeCompare(b)))]
  weeks.forEach((_, i) => {
    frames.push(toRank([...teams].sort((a, b) =>
      cumulative[b][i] - cumulative[a][i] || a.localeCompare(b))))
  })
  frames.push(toRank(teams))

  // Weekly high / low among teams that scored that week.
  const extremes = weeks.map((_, i) => {
    const scored = teams.filter((t) => points[t][i] != null)
    if (!scored.length) return { high: null, low: null }
    const high = scored.reduce((a, b) => (points[b][i] > points[a][i] ? b : a))
    const low = scored.reduce((a, b) => (points[b][i] < points[a][i] ? b : a))
    return { high, low }
  })

  // All-play: every week, a win against every team you outscored. Luck =
  // actual wins minus the wins those scores "earned" (all-play win rate ×
  // games). Only meaningful when the weekly doc covers exactly the games
  // ESPN has counted — otherwise the two numbers describe different weeks,
  // so `luckValid` is false and the card hides the column.
  const records = Object.fromEntries(table.map((s) => [s.teamName, parseRecord(s.record)]))
  const gamesPlayed = Math.max(0, ...Object.values(records).map((r) => r.wins + r.losses + r.ties))
  const allPlay = Object.fromEntries(teams.map((t) => {
    let w = 0, l = 0, tie = 0
    weeks.forEach((_, i) => {
      const mine = points[t][i]
      if (mine == null) return
      teams.forEach((o) => {
        if (o === t || points[o][i] == null) return
        if (mine > points[o][i]) w++
        else if (mine < points[o][i]) l++
        else tie++
      })
    })
    return [t, { wins: w, losses: l, ties: tie }]
  }))
  const luckValid = weeks.length > 0 && weeks.length === gamesPlayed
  const luck = Object.fromEntries(teams.map((t) => {
    const ap = allPlay[t], n = ap.wins + ap.losses + ap.ties
    const expected = n ? ((ap.wins + ap.ties / 2) / n) * gamesPlayed : 0
    const actual = records[t].wins + records[t].ties / 2
    return [t, luckValid ? actual - expected : null]
  }))

  const unbeaten = teams.filter((t) => records[t].losses === 0 && records[t].wins > 0)
  const cutPlace = Math.min(PLAYOFF_SPOTS, teams.length)

  return { table, teams, weeks, points, cumulative, frames, extremes, records, gamesPlayed,
    allPlay, luck, luckValid, unbeaten, cutPlace }
}

/** This week's game for a team from espnLiveScores/{season}, or null. */
export function liveGameFor(board, team) {
  const g = board?.games?.find((x) => x.home === team || x.away === team)
  if (!g) return null
  const home = g.home === team
  return {
    opponent: home ? g.away : g.home,
    mine: home ? g.homeScore : g.awayScore,
    theirs: home ? g.awayScore : g.homeScore,
    final: !!g.final,
    started: (g.homeScore ?? 0) > 0 || (g.awayScore ?? 0) > 0,
    week: board.week,
  }
}

// ── timeline ──────────────────────────────────────────────────
// The card plays one beat per completed week, but the whole race is capped
// so a week-14 replay is no longer than a week-4 one.
export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v))
export const ease = (t) => t * t * (3 - 2 * t)

/**
 * Split 0..1 progress into the card's beats.
 * kickoff → race (one stage per week) → standings → luck → settle.
 */
export function beats(p, weekCount) {
  const RACE0 = 0.08, RACE1 = 0.66
  const stages = []
  for (let i = 0; i < weekCount; i++) {
    const a = RACE0 + ((RACE1 - RACE0) * i) / weekCount
    const b = RACE0 + ((RACE1 - RACE0) * (i + 1)) / weekCount
    stages.push(ease(clamp((p - a) / ((b - a) * 0.8))))
  }
  return {
    stages,                                   // one 0..1 per week
    standings: ease(clamp((p - 0.68) / 0.1)),
    luck: ease(clamp((p - 0.8) / 0.08)),
    settle: ease(clamp((p - 0.9) / 0.1)),
  }
}

/** Interpolated row (0-based, fractional) for a team at these beats. */
export function rowAt(reel, team, b) {
  let y = reel.frames[0][team]
  b.stages.forEach((s, i) => { y += (reel.frames[i + 1][team] - y) * s })
  y += (reel.frames[reel.frames.length - 1][team] - y) * b.standings
  return y
}

/** Running points shown on a team's bar, and the scale's max, at these beats. */
export function barAt(reel, team, b) {
  let v = 0, max = 1
  b.stages.forEach((s, i) => {
    const target = reel.cumulative[team][i]
    const tmax = Math.max(1, ...reel.teams.map((t) => reel.cumulative[t][i]))
    v += (target - v) * s
    max += (tmax - max) * s
  })
  return { value: v, max }
}

/** The last week whose stage is past halfway (0 = still kickoff). */
export function currentWeekIndex(b) {
  let k = 0
  b.stages.forEach((s, i) => { if (s > 0.5) k = i + 1 })
  return k
}
