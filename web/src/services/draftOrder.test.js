import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  slotLabel, flattenBlocks, validateOrder, championHoldsLastPick,
  assignSlots, resolveSlotOwners, onTheClock, openSlotsFor,
  holdingsByTeam, slotOwnerMap, pickState,
  TEAMS_PER_ROUND,
} from './draftOrder.js'

const TEAMS = [
  'A. Zurek', 'Abad', 'Bill', 'Cantone', 'Dugan', 'Faybik',
  'Foley', 'Jared', 'Jason', 'M. Zurek', 'Ryan', 'Wayne',
]

// A legal order: four missed the playoffs, four lost in round one, four
// advanced — champion last.
const BLOCKS = {
  lottery: ['Wayne', 'Foley', 'Jason', 'Faybik'],
  firstRoundLosers: ['Cantone', 'Abad', 'Dugan', 'Ryan'],
  advanced: ['M. Zurek', 'A. Zurek', 'Jared', 'Bill'],
}

// ── slot labels ────────────────────────────────────────────────

test('slots are zero-padded so they sort and line up', () => {
  assert.equal(slotLabel(1, 1), '1.01')
  assert.equal(slotLabel(1, 12), '1.12')
  assert.equal(slotLabel(2, 7), '2.07')
})

// ── validation ─────────────────────────────────────────────────

test('a legal order has nothing wrong with it', () => {
  assert.deepEqual(validateOrder(BLOCKS, TEAMS), [])
  assert.equal(flattenBlocks(BLOCKS).length, TEAMS_PER_ROUND)
})

test('every problem is reported at once, not one per attempt', () => {
  // The commissioner is typing twelve names in after a season; making him
  // resubmit to discover the second mistake would be its own bug.
  const problems = validateOrder(
    { lottery: ['Wayne', 'Foley'], firstRoundLosers: ['Cantone', 'Cantone', 'Dugan', 'Ryan'], advanced: [] },
    TEAMS,
  )
  assert.ok(problems.length >= 3, `expected several problems, got ${problems.length}`)
  assert.ok(problems.some((p) => p.includes('Lottery')))
  assert.ok(problems.some((p) => p.includes('Cantone appears more than once')))
})

test('a team that is not in the league is named', () => {
  const bad = { ...BLOCKS, lottery: ['Wayne', 'Foley', 'Jason', 'Nobody'] }
  assert.ok(validateOrder(bad, TEAMS).some((p) => p === "Nobody isn't a league team."))
})

test('a full-length order that leaves someone out says who', () => {
  // Twelve names, right block sizes, but Faybik was typed twice and
  // Wayne omitted — the shape looks fine and the order is still wrong.
  const bad = { ...BLOCKS, lottery: ['Faybik', 'Foley', 'Jason', 'Faybik'] }
  const problems = validateOrder(bad, TEAMS)
  assert.ok(problems.some((p) => p.includes('Missing: Wayne')))
})

test('an empty order is not yet an error — nobody has entered it', () => {
  // Before the season ends there IS no order; blank must not read as broken.
  const problems = validateOrder({}, TEAMS)
  assert.ok(!problems.some((p) => p.includes('Missing')))
})

test('the champion holds the last pick of round one', () => {
  assert.equal(championHoldsLastPick(BLOCKS, 'Bill'), true)
  assert.equal(championHoldsLastPick(BLOCKS, 'Jared'), false)
  // Unknown champion can't contradict anything.
  assert.equal(championHoldsLastPick(BLOCKS, null), true)
})

// ── slots ──────────────────────────────────────────────────────

test('an order expands to two full rounds', () => {
  const slots = assignSlots(flattenBlocks(BLOCKS))
  assert.equal(slots.length, 24)
  assert.equal(slots[0].slot, '1.01')
  assert.equal(slots[11].slot, '1.12')
  assert.equal(slots[12].slot, '2.01')
  assert.equal(slots.at(-1).slot, '2.12')
})

test('round two repeats round one in the same order', () => {
  const slots = assignSlots(flattenBlocks(BLOCKS))
  const r1 = slots.filter((s) => s.round === 1).map((s) => s.originalTeam)
  const r2 = slots.filter((s) => s.round === 2).map((s) => s.originalTeam)
  assert.deepEqual(r1, r2)
})

test('the champion picks last in round one', () => {
  const slots = assignSlots(flattenBlocks(BLOCKS))
  assert.equal(slots.find((s) => s.slot === '1.12').originalTeam, 'Bill')
})

// ── who actually owns each slot ────────────────────────────────

const PICKS = [
  { id: 'p1', season: 2027, round: 1, originalTeamName: 'Wayne',  currentTeamName: 'Jared' },
  { id: 'p2', season: 2027, round: 2, originalTeamName: 'Wayne',  currentTeamName: 'Wayne' },
  { id: 'p3', season: 2027, round: 1, originalTeamName: 'Bill',   currentTeamName: 'Bill'  },
  { id: 'p4', season: 2026, round: 1, originalTeamName: 'Foley',  currentTeamName: 'Abad'  }, // wrong season
]

test('a traded pick resolves to whoever holds it now', () => {
  const slots = resolveSlotOwners(assignSlots(flattenBlocks(BLOCKS)), PICKS, 2027)
  const first = slots.find((s) => s.slot === '1.01')
  assert.equal(first.originalTeam, 'Wayne')
  assert.equal(first.team, 'Jared')
  assert.equal(first.via, 'Wayne')
  assert.equal(first.pickId, 'p1')
})

test('a pick still with the team that earned it is not marked as traded', () => {
  const slots = resolveSlotOwners(assignSlots(flattenBlocks(BLOCKS)), PICKS, 2027)
  const bill = slots.find((s) => s.slot === '1.12')
  assert.equal(bill.team, 'Bill')
  assert.equal(bill.via, null)
})

test('another season\'s ledger never moves this season\'s slot', () => {
  // p4 hands Foley's FIRST to Abad, but in 2026 — 1.02 stays with Foley.
  const slots = resolveSlotOwners(assignSlots(flattenBlocks(BLOCKS)), PICKS, 2027)
  assert.equal(slots.find((s) => s.slot === '1.02').team, 'Foley')
})

test('a slot with no ledger entry falls back to the team that earned it', () => {
  const slots = resolveSlotOwners(assignSlots(flattenBlocks(BLOCKS)), [], 2027)
  assert.ok(slots.every((s) => s.team === s.originalTeam && s.via === null))
})

test('the owner map is what the security rules compare against', () => {
  const map = slotOwnerMap(resolveSlotOwners(assignSlots(flattenBlocks(BLOCKS)), PICKS, 2027))
  assert.equal(Object.keys(map).length, 24)
  assert.equal(map['1.01'], 'Jared')   // traded
  assert.equal(map['2.01'], 'Wayne')   // kept
  assert.deepEqual(slotOwnerMap(null), {})
})

// ── the clock ──────────────────────────────────────────────────

const SLOTS = resolveSlotOwners(assignSlots(flattenBlocks(BLOCKS)), PICKS, 2027)

test('the clock is on the first slot with no selection', () => {
  assert.equal(onTheClock(SLOTS, {}).slot, '1.01')
  assert.equal(onTheClock(SLOTS, { '1.01': {}, '1.02': {} }).slot, '1.03')
})

test('a complete draft has nobody on the clock', () => {
  const made = Object.fromEntries(SLOTS.map((s) => [s.slot, {}]))
  assert.equal(onTheClock(SLOTS, made), null)
})

test('a gap does not skip the clock forward', () => {
  // If 1.03 somehow lands before 1.02, the clock stays on 1.02 — the
  // draft is in order and a missing pick is a problem to see, not skip.
  assert.equal(onTheClock(SLOTS, { '1.01': {}, '1.03': {} }).slot, '1.02')
})

test('a team sees only its own unused slots', () => {
  const mine = openSlotsFor(SLOTS, {}, 'Jared')
  // Jared's own two plus Wayne's traded first.
  assert.deepEqual(mine.map((s) => s.slot), ['1.01', '1.11', '2.11'])
  assert.deepEqual(openSlotsFor(SLOTS, { '1.01': {} }, 'Jared').map((s) => s.slot), ['1.11', '2.11'])
  assert.deepEqual(openSlotsFor(SLOTS, {}, ''), [])
})

// ── permission to pick ─────────────────────────────────────────

test('the team on the clock may pick once the room is open', () => {
  const s = pickState({ slots: SLOTS, made: {}, teamName: 'Jared', live: true })
  assert.equal(s.canPick, true)
  assert.equal(s.slot.slot, '1.01')
})

test('a team that is not up is told whose pick it is', () => {
  const s = pickState({ slots: SLOTS, made: {}, teamName: 'Bill', live: true })
  assert.equal(s.canPick, false)
  assert.equal(s.reason, 'Jared is on the clock.')
})

test('nobody picks before the commissioner opens the room', () => {
  const s = pickState({ slots: SLOTS, made: {}, teamName: 'Jared', live: false })
  assert.equal(s.canPick, false)
  assert.match(s.reason, /isn't open/)
})

test('the commissioner can pick for whoever is asleep', () => {
  const s = pickState({ slots: SLOTS, made: {}, teamName: 'Jared', isAdmin: true, live: false })
  assert.equal(s.canPick, true)
  assert.equal(s.slot.slot, '1.01')
})

test('no order means nothing to pick, even for the commissioner', () => {
  const s = pickState({ slots: [], teamName: 'Jared', isAdmin: true, live: true })
  assert.equal(s.canPick, false)
  assert.match(s.reason, /hasn't been set/)
})

test('a finished draft closes the room to everyone', () => {
  const made = Object.fromEntries(SLOTS.map((s) => [s.slot, {}]))
  const s = pickState({ slots: SLOTS, made, teamName: 'Jared', isAdmin: true, live: true })
  assert.equal(s.canPick, false)
  assert.equal(s.complete, true)
})

// ── pre-lottery holdings ───────────────────────────────────────

test('holdings count real picks, so two firsts and no second shows', () => {
  const rows = holdingsByTeam(PICKS, 2027, TEAMS)
  const jared = rows.find((r) => r.team === 'Jared')
  assert.equal(jared.total, 1)
  assert.equal(jared.rounds[1], 1)
  assert.equal(jared.rounds[2], undefined)
  const wayne = rows.find((r) => r.team === 'Wayne')
  assert.equal(wayne.rounds[2], 1)
  assert.equal(wayne.rounds[1], undefined)
})

test('every league team appears even with no picks on file', () => {
  const rows = holdingsByTeam([], 2027, TEAMS)
  assert.equal(rows.length, TEAMS.length)
  assert.ok(rows.every((r) => r.total === 0))
})

test('holdings sort by count, then name, so the table never jitters', () => {
  const rows = holdingsByTeam(
    [
      { season: 2027, round: 1, currentTeamName: 'Ryan' },
      { season: 2027, round: 2, currentTeamName: 'Ryan' },
      { season: 2027, round: 1, currentTeamName: 'Abad' },
      { season: 2027, round: 1, currentTeamName: 'Bill' },
    ],
    2027,
    [],
  )
  assert.deepEqual(rows.map((r) => r.team), ['Ryan', 'Abad', 'Bill'])
})
