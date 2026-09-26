// lineupOptimizer — what a team's best possible lineup would have scored.
//
// Used by web/scripts/import-history.mjs to precompute bench regret for every
// team-week since 2018 (the first season ESPN kept weekly player lines).
//
// The league's lineup has changed shape over the years — kickers and an RB/WR
// slot in the older seasons, FLEX and OP in the modern one — so the required
// slots are read from what a team ACTUALLY started that week rather than
// hardcoded. That also means a week with an illegal or short lineup optimizes
// against the lineup that was really used.

/** Which positions may fill each lineup slot. */
export const SLOT_ELIGIBILITY = {
  QB: ['QB'],
  RB: ['RB'],
  WR: ['WR'],
  TE: ['TE'],
  K: ['K'],
  'D/ST': ['D/ST'],
  FLEX: ['RB', 'WR', 'TE'],
  'RB/WR': ['RB', 'WR'],
  OP: ['QB', 'RB', 'WR', 'TE'], // offensive player utility
}

/** Slots that are not real starting spots. */
const NON_STARTING = new Set(['BE', 'IR'])

export const isStartingSlot = (slot) => Boolean(SLOT_ELIGIBILITY[slot]) && !NON_STARTING.has(slot)

/**
 * Best total a set of players could have produced in a set of slots.
 *
 * Greedy from the most restrictive slot to the least, taking the highest
 * scorer still available. That is exactly optimal here because the
 * eligibility sets form a laminar family — every pair is either disjoint
 * ({QB} vs {D/ST}) or nested ({RB} ⊂ {RB,WR} ⊂ {RB,WR,TE} ⊂ {QB,RB,WR,TE}) —
 * so a restrictive slot can never be better served by a player a broader slot
 * also wants. lineupOptimizer.test.js checks this against brute force over
 * randomized rosters.
 *
 * @param slots - ['QB','RB','RB','WR','WR','TE','FLEX','OP','D/ST']
 * @param players - [{ position, points }] — every player eligible to start
 *   (IR players must be excluded by the caller)
 * @returns { total, picks: [{ slot, position, points, player }] }
 */
export function optimalLineup(slots, players) {
  const pool = (players ?? [])
    .filter((p) => p && Number.isFinite(Number(p.points)))
    .map((p, i) => ({ ...p, points: Number(p.points), _i: i }))
    .sort((a, b) => b.points - a.points)

  const used = new Set()
  const ordered = [...slots]
    .filter(isStartingSlot)
    .sort((a, b) => SLOT_ELIGIBILITY[a].length - SLOT_ELIGIBILITY[b].length)

  const picks = []
  let total = 0
  for (const slot of ordered) {
    const eligible = SLOT_ELIGIBILITY[slot]
    // pool is points-descending, so the first match is the best available.
    const found = pool.find((p) => !used.has(p._i) && eligible.includes(p.position))
    if (!found) continue
    used.add(found._i)
    total += found.points
    picks.push({ slot, position: found.position, points: found.points, player: found.player ?? null })
  }
  return { total: Math.round(total * 100) / 100, picks }
}

/**
 * One team-week's lineup outcome.
 *
 * `regret` is the optimal total minus what the started lineup actually scored,
 * both measured from the same player rows. ESPN's official team score
 * occasionally differs from the sum of its own starter lines by a point or so
 * (stat corrections), so mixing the two sources would smear that discrepancy
 * into the regret figure.
 *
 * @param rows - that team's player lines for the week:
 *   [{ player, position, slot, status, points }]
 * @returns null when the week has no usable starter data, else
 *   { started, optimal, regret, slots, benchPoints }
 */
export function weekRegret(rows) {
  const usable = (rows ?? []).filter((r) => r && Number.isFinite(Number(r.points)))
  const starters = usable.filter((r) => r.status === 'Starter' && isStartingSlot(r.slot))
  if (starters.length === 0) return null

  // IR players cannot be started, so they are not candidates for the optimal
  // lineup — crediting a team for a player it was not allowed to play would
  // invent regret out of nothing.
  const available = usable.filter((r) => r.status !== 'IR' && r.slot !== 'IR')

  const started = Math.round(starters.reduce((a, r) => a + Number(r.points), 0) * 100) / 100
  const slots = starters.map((r) => r.slot)
  const { total: optimal } = optimalLineup(slots, available)
  const bench = usable.filter((r) => r.status === 'Bench')

  return {
    started,
    optimal,
    regret: Math.round((optimal - started) * 100) / 100,
    slots,
    benchPoints: Math.round(bench.reduce((a, r) => a + Number(r.points), 0) * 100) / 100,
  }
}

/**
 * Career bench-regret totals per team.
 * @param rows - [{ season, week, team, started, optimal, regret, flipped }]
 * @returns [{ team, regret, perWeek, weeks, flippedLosses }] worst first
 */
export function regretLeaderboard(rows, includeTeam = () => true) {
  const acc = new Map()
  for (const r of rows ?? []) {
    if (!r?.team || !includeTeam(r.team)) continue
    const t = acc.get(r.team) ?? { team: r.team, regret: 0, weeks: 0, flippedLosses: 0 }
    t.regret += Number(r.regret) || 0
    t.weeks += 1
    if (r.flipped) t.flippedLosses += 1
    acc.set(r.team, t)
  }
  return [...acc.values()]
    .map((t) => ({ ...t, regret: Math.round(t.regret * 100) / 100, perWeek: t.weeks ? t.regret / t.weeks : 0 }))
    .sort((a, b) => b.regret - a.regret)
}

/** Positions reported in Roster DNA, in lineup order. */
export const DNA_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'D/ST', 'K']

/**
 * Share of a team's STARTER points that came from each position — the shape of
 * a roster, not its size. Bench points are excluded: what a team leaned on is
 * what it actually put on the field.
 *
 * @param share - [{ team, byPosition: {QB: n, …}, total }]
 * @returns [{ team, total, shares: {QB: 0.21, …, Other: 0} }] sorted by team
 */
export function rosterDNA(share, includeTeam = () => true) {
  return (share ?? [])
    .filter((s) => s?.team && includeTeam(s.team) && Number(s.total) > 0)
    .map((s) => {
      const total = Number(s.total)
      let known = 0
      for (const pos of DNA_POSITIONS) known += Number(s.byPosition?.[pos] ?? 0)
      // The parts should never exceed the stated total, but if a malformed doc
      // ever says they do, divide by the parts instead. Otherwise the shares
      // sum past 1 and the stacked bar overflows its own track.
      const denom = Math.max(total, known)
      const shares = {}
      for (const pos of DNA_POSITIONS) shares[pos] = Number(s.byPosition?.[pos] ?? 0) / denom
      shares.Other = Math.max(0, (denom - known) / denom)
      return { team: s.team, total, shares }
    })
    .sort((a, b) => a.team.localeCompare(b.team))
}
