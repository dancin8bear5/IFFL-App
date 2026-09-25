// historyAnalytics — Trophy Room math over the imported ESPN game history
// (`historyMatchups/{year}` docs, seeded by web/scripts/import-history.mjs).
//
// Input shape everywhere: an array of season docs
//   { season, rows: [{ week, team, opponent, points, oppPoints, result, benchPoints }] }
// where `rows` holds one row PER TEAM per game (every game appears twice, once
// from each side) and `result` is W/L/T from that row's team's perspective.
// Playoff weeks are included in the rows; regular-season length varies by era.
//
// All functions are pure and era-aware. Former members are NOT filtered here —
// callers decide with isActiveTeam, same as the rest of the Trophy Room.

/** Regular season was 13 games through 2020, 14 from 2021 on. */
export const regularWeeks = (season) => (Number(season) >= 2021 ? 14 : 13)

const isScore = (v) => v !== null && v !== undefined && Number.isFinite(Number(v))

/**
 * All-time head-to-head grid between the given teams (playoffs included).
 * Because every game appears once from each side, counting each row from its
 * own team's perspective yields a naturally symmetric grid (a beat b ⇔ b lost
 * to a) without any dedup step.
 *
 * @returns { teams: [name…] (win% desc), grid: { [a]: { [b]: {w, l, t, games, pct} } } }
 */
export function headToHead(docs, teamNames) {
  const include = new Set(teamNames)
  const grid = {}
  const cell = (a, b) => ((grid[a] ??= {})[b] ??= { w: 0, l: 0, t: 0, games: 0, pct: null })

  for (const doc of docs ?? []) {
    for (const r of doc.rows ?? []) {
      if (!include.has(r.team) || !include.has(r.opponent)) continue
      const c = cell(r.team, r.opponent)
      c.games += 1
      if (r.result === 'W') c.w += 1
      else if (r.result === 'L') c.l += 1
      else if (r.result === 'T') c.t += 1
    }
  }

  const totals = new Map()
  for (const a of Object.keys(grid)) {
    let w = 0, l = 0, t = 0
    for (const b of Object.keys(grid[a])) {
      const c = grid[a][b]
      c.pct = c.games > 0 ? (c.w + c.t * 0.5) / c.games : null
      w += c.w; l += c.l; t += c.t
    }
    totals.set(a, w + l + t > 0 ? (w + t * 0.5) / (w + l + t) : 0)
  }

  const teams = [...teamNames]
    .filter((n) => totals.has(n))
    .sort((a, b) => totals.get(b) - totals.get(a) || a.localeCompare(b))
  return { teams, grid }
}

/**
 * Rank one week's scores against everyone (the all-play week). Teams tied on
 * points share the average of the win slots they span, so a tie can't invent
 * wins — same convention as services/trueRecord.js.
 * @returns Map teamName → expected wins that week (0 … n-1)
 */
export function allPlayWeek(entries) {
  const sorted = [...entries].sort((a, b) => b.points - a.points)
  const out = new Map()
  let i = 0
  while (i < sorted.length) {
    let j = i
    while (j + 1 < sorted.length && sorted[j + 1].points === sorted[i].points) j++
    const tied = j - i + 1
    const totalWins = Array.from({ length: tied }, (_, k) => sorted.length - 1 - (i + k)).reduce((a, b) => a + b, 0)
    for (let k = i; k <= j; k++) out.set(sorted[k].team, totalWins / tied)
    i = j + 1
  }
  return out
}

/**
 * Schedule luck: actual regular-season wins minus all-play expected wins.
 * Expected wins scale each all-play week to one game (beat 8 of 11 → 8/11 of
 * a win), so actual and expected live on the same axis.
 *
 * @returns {
 *   seasons: [{ season, team, actualWins, expectedWins, luck }] (luck asc),
 *   career:  [{ team, actualWins, expectedWins, luck, seasons }] (luck asc),
 * }
 */
export function allPlayLuck(docs) {
  const seasonRows = []
  const career = new Map()

  for (const doc of docs ?? []) {
    const season = Number(doc.season)
    const regCut = regularWeeks(season)
    const byWeek = new Map()
    const actual = new Map()

    for (const r of doc.rows ?? []) {
      if (!(Number(r.week) <= regCut) || !isScore(r.points)) continue
      if (!byWeek.has(r.week)) byWeek.set(r.week, [])
      byWeek.get(r.week).push({ team: r.team, points: Number(r.points) })
      const a = actual.get(r.team) ?? 0
      actual.set(r.team, a + (r.result === 'W' ? 1 : r.result === 'T' ? 0.5 : 0))
    }

    const expected = new Map()
    for (const entries of byWeek.values()) {
      if (entries.length < 2) continue
      const ap = allPlayWeek(entries)
      for (const [team, wins] of ap) {
        expected.set(team, (expected.get(team) ?? 0) + wins / (entries.length - 1))
      }
    }

    for (const [team, exp] of expected) {
      const act = actual.get(team) ?? 0
      seasonRows.push({ season, team, actualWins: act, expectedWins: exp, luck: act - exp })
      const c = career.get(team) ?? { team, actualWins: 0, expectedWins: 0, seasons: 0 }
      c.actualWins += act
      c.expectedWins += exp
      c.seasons += 1
      career.set(team, c)
    }
  }

  return {
    seasons: seasonRows.sort((a, b) => a.luck - b.luck),
    career: [...career.values()]
      .map((c) => ({ ...c, luck: c.actualWins - c.expectedWins }))
      .sort((a, b) => a.luck - b.luck),
  }
}

/**
 * Clutch factor: postseason PPG minus regular-season PPG per team. Every team
 * plays the postseason weeks (winners + consolation brackets), so this is
 * "how do you score after week 13/14", not title-bracket-only.
 *
 * @returns [{ team, regPPG, postPPG, delta, regGames, postGames }] (delta desc)
 */
export function clutchFactor(docs) {
  const acc = new Map()
  for (const doc of docs ?? []) {
    const regCut = regularWeeks(doc.season)
    for (const r of doc.rows ?? []) {
      if (!isScore(r.points)) continue
      const t = acc.get(r.team) ?? { team: r.team, reg: 0, regGames: 0, post: 0, postGames: 0 }
      if (Number(r.week) <= regCut) { t.reg += Number(r.points); t.regGames += 1 }
      else { t.post += Number(r.points); t.postGames += 1 }
      acc.set(r.team, t)
    }
  }
  return [...acc.values()]
    .filter((t) => t.regGames > 0 && t.postGames > 0)
    .map((t) => ({
      team: t.team,
      regPPG: t.reg / t.regGames,
      postPPG: t.post / t.postGames,
      delta: t.post / t.postGames - t.reg / t.regGames,
      regGames: t.regGames,
      postGames: t.postGames,
    }))
    .sort((a, b) => b.delta - a.delta)
}
