// playoffs — seeding, the opponent draft, and the seeding bonus.
//
// Two league rules make this bracket unlike anyone else's:
//
//   1. OPPONENT SELECTION. The top seeds don't get handed 1v8, 2v7 etc.
//      They CHOOSE, in seed order, from the bottom half. Seed 1 picks
//      first, then 2, then 3; seed 4 takes whoever is left over. The pick
//      is a real strategic decision — the lowest seed isn't always the
//      softest matchup.
//
//   2. SEEDING BONUS. The team with more regular-season wins starts the
//      matchup with SEEDING_BONUS_PER_WIN points per extra win. An 11-3
//      seed facing an 8-6 seed is spotted 15 points before kickoff. This
//      constant has been sitting in staticData.js and written into the
//      rulebook since S0, but nothing has ever applied it.
//
// Pure functions only — no Firebase. Everything here is unit-tested.
import { PLAYOFF_TEAMS, SEEDING_BONUS_PER_WIN } from '../data/staticData.js'

/** Wins from a record object, tolerant of missing/partial data. */
const winsOf = (r) => (Number.isFinite(r?.wins) ? r.wins : 0)
const lossesOf = (r) => (Number.isFinite(r?.losses) ? r.losses : 0)
const tiesOf = (r) => (Number.isFinite(r?.ties) ? r.ties : 0)

/** A tie counts a half-win, so 9-4-1 outranks 9-5 as it should. */
export const winValue = (r) => winsOf(r) + tiesOf(r) * 0.5

/**
 * Rank every team with a record and take the top N.
 *
 * Ties on record break on total points scored — the standard fantasy
 * tiebreak, and the only one we can compute from data the app holds.
 * A team with no points recorded still seeds (record is what matters);
 * it just loses every tiebreak.
 *
 * @param records - { [teamName]: {wins, losses, ties} }
 * @param pointsFor - { [teamName]: number } season totals, for the tiebreak
 * @param size - how many teams make the field (defaults to the league rule)
 * @returns [{ seed, teamName, wins, losses, ties, pointsFor }] — seed 1 first
 */
export function computeSeeds(records, pointsFor = {}, size = PLAYOFF_TEAMS) {
  return Object.entries(records ?? {})
    .map(([teamName, r]) => ({
      teamName,
      wins: winsOf(r),
      losses: lossesOf(r),
      ties: tiesOf(r),
      pointsFor: Number(pointsFor?.[teamName]) || 0,
    }))
    .sort((a, b) => winValue(b) - winValue(a) || b.pointsFor - a.pointsFor || a.teamName.localeCompare(b.teamName))
    .slice(0, size)
    .map((t, i) => ({ ...t, seed: i + 1 }))
}

/**
 * The head start the better regular-season record earns in a matchup.
 *
 * @returns { teamName, points } for the team receiving it, or null when
 *   the records are level (a bonus of zero is not a bonus — say so with
 *   null rather than making the UI render "+0 to nobody").
 */
export function seedingBonus(teamA, teamB, perWin = SEEDING_BONUS_PER_WIN) {
  const diff = winValue(teamA) - winValue(teamB)
  if (diff === 0) return null
  const winner = diff > 0 ? teamA : teamB
  return { teamName: winner.teamName, points: Math.abs(diff) * perWin }
}

/**
 * Which seeds get to pick, in the order they pick.
 *
 * With an 8-team field: seeds 1, 2 and 3 choose; seed 4 is left with the
 * last unchosen team. Generalised so a field of 4 (seeds 1 chooses) or a
 * future field size still works.
 */
export function choosingSeeds(fieldSize = PLAYOFF_TEAMS) {
  const half = Math.floor(fieldSize / 2)
  // The last high seed has no choice left to make — one opponent remains.
  return Array.from({ length: Math.max(0, half - 1) }, (_, i) => i + 1)
}

/** The lower half of the bracket — the pool that gets picked FROM. */
export function selectableOpponents(seeds, fieldSize = PLAYOFF_TEAMS) {
  const half = Math.floor(fieldSize / 2)
  return seeds.filter((s) => s.seed > half)
}

/**
 * Who is still on the board for a given chooser.
 *
 * @param selections - { [chooserSeed]: teamName } picks made so far
 */
export function availableOpponents(seeds, selections, fieldSize = PLAYOFF_TEAMS) {
  const taken = new Set(Object.values(selections ?? {}).filter(Boolean))
  return selectableOpponents(seeds, fieldSize).filter((s) => !taken.has(s.teamName))
}

/**
 * The seed whose turn it is, or null when every pick is in.
 * Picks are strictly in seed order — seed 2 cannot jump ahead of seed 1.
 */
export function nextChooser(seeds, selections, fieldSize = PLAYOFF_TEAMS) {
  const order = choosingSeeds(fieldSize)
  const pending = order.find((seed) => !selections?.[seed])
  if (pending === undefined) return null
  return seeds.find((s) => s.seed === pending) ?? null
}

/**
 * Build the first-round matchups from the picks made so far.
 *
 * Incomplete selections are fine and expected — this renders live while
 * the draft is still happening, so an unmade pick comes back as a
 * matchup with a null opponent rather than being omitted.
 *
 * @returns [{ high, low, bonus, complete }]
 */
export function buildRoundOne(seeds, selections, fieldSize = PLAYOFF_TEAMS) {
  const half = Math.floor(fieldSize / 2)
  const highs = seeds.filter((s) => s.seed <= half)
  const order = choosingSeeds(fieldSize)
  const taken = new Set(order.map((seed) => selections?.[seed]).filter(Boolean))

  return highs.map((high) => {
    let lowName = selections?.[high.seed] ?? null
    // The final high seed never picks: whoever is still unclaimed is
    // theirs, and only once everyone ahead of them has chosen.
    if (!order.includes(high.seed)) {
      const leftovers = selectableOpponents(seeds, fieldSize).filter((s) => !taken.has(s.teamName))
      lowName = leftovers.length === 1 ? leftovers[0].teamName : null
    }
    const low = lowName ? seeds.find((s) => s.teamName === lowName) ?? null : null
    return {
      high,
      low,
      bonus: low ? seedingBonus(high, low) : null,
      complete: Boolean(low),
    }
  })
}

/**
 * Pair the winners of one round into the next.
 *
 * Re-seeded, not fixed-bracket: the highest surviving seed always plays
 * the lowest surviving seed. Returns [] until EVERY matchup in the
 * previous round has a recorded winner.
 *
 * `expectedGames` is what makes that check honest. Winners arrive as a
 * positional array with nulls for undecided games, and without knowing how
 * many games the round had, two decided games out of four look exactly
 * like a finished two-game round — which would conjure a semifinal out of
 * a half-played quarterfinal.
 *
 * @param winners - positional [teamName|null], one slot per game
 * @param expectedGames - how many games that round had; omit only when the
 *   caller genuinely has a complete list and no round to check against
 */
export function buildNextRound(seeds, winners, expectedGames = null) {
  const named = (winners ?? []).filter(Boolean)
  if (expectedGames !== null && named.length !== expectedGames) return []

  const alive = named
    .map((name) => seeds.find((s) => s.teamName === name))
    .filter(Boolean)
    .sort((a, b) => a.seed - b.seed)

  // Every name had to resolve to a real seed — an unknown name means the
  // data is wrong, and half a bracket is worse than none.
  if (expectedGames !== null && alive.length !== named.length) return []
  if (alive.length < 2 || alive.length % 2 !== 0) return []

  const games = []
  for (let i = 0; i < alive.length / 2; i++) {
    const high = alive[i]
    const low = alive[alive.length - 1 - i]
    games.push({ high, low, bonus: seedingBonus(high, low), complete: true })
  }
  return games
}

/** Human label for a playoff round, given how many teams are left. */
export function roundLabel(teamsRemaining) {
  if (teamsRemaining === 2) return 'Championship'
  if (teamsRemaining === 4) return 'Semifinals'
  if (teamsRemaining === 8) return 'Quarterfinals'
  return `Round of ${teamsRemaining}`
}
