// draftOrder — turning a finished season into a rookie draft order.
//
// The league's order is three blocks of four, and the blocks come from
// three different places:
//
//   1.01–1.04  the four teams that missed the playoffs, ordered by LOTTERY
//   1.05–1.08  the four first-round playoff losers, inverse season finish
//   1.09–1.12  the four who advanced, inverse of final finish
//
// 1.12 is always the reigning champion. Round two repeats the same order.
//
// The BLOCKS are rules; the order WITHIN each block is a result — a lottery
// draw, a set of finishes — that a human enters once the season ends. So
// this module doesn't invent an order: it takes the three blocks, checks
// they form a legal one, and turns them into slots.
//
// Until that happens a pick has no slot at all. It's just "a 1st" or "a
// 2nd", which is exactly how the league talks about them in trades all
// year, and the draft room reflects that.

export const TEAMS_PER_ROUND = 12
export const ROUNDS = 2
export const BLOCK_SIZE = 4

/** "1.01" for round 1, pick 1. Zero-padded so slots sort and read evenly. */
export function slotLabel(round, pickNumber) {
  return `${round}.${String(pickNumber).padStart(2, '0')}`
}

/**
 * Flatten the three blocks into one 12-team order.
 * @param blocks - { lottery, firstRoundLosers, advanced } — each 4 team names,
 *   already in their intended order; `advanced` ends with the champion.
 */
export function flattenBlocks(blocks = {}) {
  return [
    ...(blocks.lottery ?? []),
    ...(blocks.firstRoundLosers ?? []),
    ...(blocks.advanced ?? []),
  ]
}

/**
 * Everything wrong with a proposed order, in plain language.
 *
 * Returns a list rather than throwing on the first problem: the
 * commissioner is filling this in by hand at the end of a season and
 * should see every mistake at once, not one per attempt.
 */
export function validateOrder(blocks = {}, teams = []) {
  const problems = []
  const { lottery = [], firstRoundLosers = [], advanced = [] } = blocks

  for (const [label, block] of [
    ['Lottery (picks 1-4)', lottery],
    ['First-round losers (picks 5-8)', firstRoundLosers],
    ['Advanced (picks 9-12)', advanced],
  ]) {
    if (block.length !== BLOCK_SIZE) {
      problems.push(`${label} needs ${BLOCK_SIZE} teams — has ${block.length}.`)
    }
  }

  const all = flattenBlocks(blocks)
  const seen = new Set()
  for (const t of all) {
    if (seen.has(t)) problems.push(`${t} appears more than once.`)
    seen.add(t)
  }

  if (teams.length > 0) {
    const known = new Set(teams)
    for (const t of all) if (!known.has(t)) problems.push(`${t} isn't a league team.`)
    const missing = teams.filter((t) => !seen.has(t))
    if (all.length === TEAMS_PER_ROUND && missing.length > 0) {
      problems.push(`Missing: ${missing.join(', ')}.`)
    }
  }

  if (all.length !== TEAMS_PER_ROUND && all.length !== 0) {
    problems.push(`An order is ${TEAMS_PER_ROUND} teams — this one has ${all.length}.`)
  }

  return problems
}

/**
 * The champion, by rule, holds the last pick of round one.
 * Checked separately from validateOrder because it's a fact about the
 * SEASON, not the shape of the order, and the caller may not know it.
 */
export function championHoldsLastPick(blocks, champion) {
  if (!champion) return true
  const advanced = blocks?.advanced ?? []
  return advanced[advanced.length - 1] === champion
}

/**
 * Expand an order into slots for every round.
 * @returns [{ slot, round, pickNumber, originalTeam }] in draft order
 */
export function assignSlots(orderedTeams, rounds = ROUNDS) {
  const teams = orderedTeams ?? []
  const out = []
  for (let round = 1; round <= rounds; round++) {
    teams.forEach((team, i) => {
      out.push({
        slot: slotLabel(round, i + 1),
        round,
        pickNumber: i + 1,
        originalTeam: team,
      })
    })
  }
  return out
}

/**
 * Who actually picks in each slot.
 *
 * The lottery decides slot ORDER by where a team finished, but picks are
 * tradeable — so slot 1.01 belongs to whoever now holds that team's first,
 * which may not be the team that earned it. Resolving through the pick
 * ledger is the difference between a board that's right and one that hands
 * a pick to the wrong manager on draft night.
 *
 * @param picks - draftPick docs: { season, round, originalTeamName, currentTeamName }
 * @returns slots with `team` (current owner) and `via` when it changed hands
 */
export function resolveSlotOwners(slots, picks, season) {
  const byKey = new Map()
  for (const p of picks ?? []) {
    if (Number(p.season) !== Number(season)) continue
    byKey.set(`${p.round}|${p.originalTeamName}`, p)
  }
  return (slots ?? []).map((s) => {
    const pick = byKey.get(`${s.round}|${s.originalTeam}`)
    const owner = pick?.currentTeamName ?? s.originalTeam
    return {
      ...s,
      team: owner,
      // Only a real change of hands is "via" — a pick still with the team
      // that earned it shouldn't be annotated as though it were traded.
      via: owner !== s.originalTeam ? s.originalTeam : null,
      pickId: pick?.id ?? null,
    }
  })
}

/**
 * The slot on the clock: the first one with no selection recorded.
 * @param made - { [slot]: selection }
 */
export function onTheClock(slots, made = {}) {
  return (slots ?? []).find((s) => !made?.[s.slot]) ?? null
}

/** Slots a given team owns and hasn't used yet. */
export function openSlotsFor(slots, made = {}, teamName) {
  if (!teamName) return []
  return (slots ?? []).filter((s) => s.team === teamName && !made?.[s.slot])
}

/**
 * What a team holds before the order exists — the all-year view.
 * A team can hold two firsts and no second once trades happen, so this
 * counts real picks rather than assuming one per round.
 */
export function holdingsByTeam(picks, season, teams = []) {
  const rows = new Map(teams.map((t) => [t, { team: t, rounds: {}, total: 0 }]))
  for (const p of picks ?? []) {
    if (Number(p.season) !== Number(season)) continue
    const owner = p.currentTeamName
    if (!owner) continue
    if (!rows.has(owner)) rows.set(owner, { team: owner, rounds: {}, total: 0 })
    const row = rows.get(owner)
    row.rounds[p.round] = (row.rounds[p.round] ?? 0) + 1
    row.total += 1
  }
  return [...rows.values()].sort((a, b) => b.total - a.total || a.team.localeCompare(b.team))
}

/**
 * The board as a plain { slot: teamName } map.
 *
 * This is what gets stored on the room's config doc, and it's the reason
 * the security rules can tell whose pick a slot is: resolving the order
 * and the pick ledger inside rules isn't practical, but comparing against
 * a published map is one lookup. Re-publish after any pick trade.
 */
export function slotOwnerMap(resolvedSlots) {
  const out = {}
  for (const s of resolvedSlots ?? []) if (s?.slot && s.team) out[s.slot] = s.team
  return out
}

/**
 * Whether this member may submit the pick that's up, and if not, why.
 *
 * All four "no" cases return a sentence rather than just false, because
 * the room shows it: someone whose turn it isn't should be told whose it
 * is, not left looking at a disabled button.
 *
 * The commissioner can pick in any slot — on draft night somebody is
 * always asleep, and the alternative is the draft stopping.
 */
export function pickState({ slots = [], made = {}, teamName = '', isAdmin = false, live = false }) {
  const onClock = onTheClock(slots, made)
  const myOpenSlots = openSlotsFor(slots, made, teamName)
  const base = { onClock, myOpenSlots, complete: false, canPick: false, slot: null, reason: '' }

  if (slots.length === 0) {
    return { ...base, reason: "The draft order hasn't been set yet." }
  }
  if (!onClock) {
    return { ...base, complete: true, reason: 'The draft is complete.' }
  }
  if (isAdmin) {
    return { ...base, canPick: true, slot: onClock, reason: '' }
  }
  if (!live) {
    return { ...base, reason: "The draft room isn't open yet." }
  }
  if (onClock.team && onClock.team === teamName) {
    return { ...base, canPick: true, slot: onClock, reason: '' }
  }
  return { ...base, reason: `${onClock.team} is on the clock.` }
}
