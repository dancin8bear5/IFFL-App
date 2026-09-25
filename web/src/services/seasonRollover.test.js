import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { extendPriceMap, computeRolloverPlan } from './seasonRollover.js'
import { parseKeeperCSV } from './keeperImport.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REAL_CSV = readFileSync(join(__dirname, 'fixtures/keeperMaster2025.csv'), 'utf8')

const TEAMS = [{ name: 'Jared' }, { name: 'Bill' }] // small roster for pick-generation tests

const player = (over) => ({
  id: 'p1', name: 'Sam Darnold', teamName: 'Jared', position: 'QB',
  prices: { 2025: 9, 2026: 19, 2027: 34 }, originalPrice: 4, purchaseYear: 2024,
  contractYearsRemaining: 2, playerPool: 'Auction', isActive: true, isPick: false,
  salaryStatus: 'rostered',
  ...over,
})

test('extendPriceMap adds exactly one more year, matching the escalation formula', () => {
  const prices = extendPriceMap(player(), 2026) // window must reach 2028
  // contractYear(2024, 2027) = 4; nextPrice(34, 4) = 34 + 20 = 54
  assert.deepEqual(prices, { 2025: 9, 2026: 19, 2027: 34, 2028: 54 })
})

test('extendPriceMap is idempotent — a map that already reaches far enough is unchanged', () => {
  const p = player({ prices: { 2025: 9, 2026: 19, 2027: 34, 2028: 54, 2029: 74 } })
  const prices = extendPriceMap(p, 2026)
  assert.deepEqual(prices, p.prices)
})

test('extendPriceMap cross-checked against the real 2025 Keeper Master CSV', () => {
  const { rows } = parseKeeperCSV(REAL_CSV, 2025)
  const sam = rows.find((r) => r.name === 'Sam Darnold')
  const extended = extendPriceMap({ prices: sam.prices, purchaseYear: sam.purchaseYear, originalPrice: sam.originalPrice }, 2026)
  assert.equal(extended[2028], 54)
})

test('rollover plan updates only rostered, active, non-pick players', () => {
  const players = [
    player(),
    player({ id: 'p2', name: 'Dropped Guy', salaryStatus: 'dropped_pending' }),
    player({ id: 'p3', name: 'Cleared Guy', salaryStatus: 'cleared' }),
    player({ id: 'p4', name: 'Retired Guy', isActive: false }),
    player({ id: 'p5', name: 'A Pick', isPick: true }),
  ]
  const plan = computeRolloverPlan(players, 2026, [], TEAMS)
  assert.equal(plan.priceUpdates.length, 1)
  assert.equal(plan.priceUpdates[0].name, 'Sam Darnold')
  assert.equal(plan.skipped.length, 3) // dropped, cleared, inactive — pick silently excluded, not "skipped"
  assert.ok(plan.skipped.some((s) => s.name === 'Dropped Guy' && s.reason.includes('drop')))
  assert.ok(plan.skipped.some((s) => s.name === 'Cleared Guy' && s.reason.includes('keeper')))
})

test('a player whose map already reaches far enough produces no price update', () => {
  // contractYearsRemaining must also already match contractYear(2024, 2026) = 3,
  // or that alone would trigger the update this test is isolating against.
  const p = player({ prices: { 2025: 9, 2026: 19, 2027: 34, 2028: 54 }, contractYearsRemaining: 3 })
  const plan = computeRolloverPlan([p], 2026, [], TEAMS)
  assert.equal(plan.priceUpdates.length, 0)
})

test('contractYearsRemaining drift alone still triggers an update even if prices already extend far enough', () => {
  const p = player({ prices: { 2025: 9, 2026: 19, 2027: 34, 2028: 54 }, contractYearsRemaining: 1 })
  const plan = computeRolloverPlan([p], 2026, [], TEAMS)
  assert.equal(plan.priceUpdates.length, 1)
  assert.equal(plan.priceUpdates[0].contractYearsRemaining, 3) // contractYear(2024, 2026)
})

test('generates exactly 2 picks per team (R1 + R2) for the season after next', () => {
  const plan = computeRolloverPlan([], 2026, [], TEAMS)
  assert.equal(plan.newPicks.length, 4) // 2 teams × 2 rounds
  assert.ok(plan.newPicks.every((p) => p.season === 2027)) // toSeason(2026) + 1
  assert.ok(plan.newPicks.every((p) => p.status === 'available'))
  assert.ok(plan.newPicks.every((p) => p.tradeHistory.length === 0))
})

test('new pick prices follow the standard $2/$1 base and escalation curve', () => {
  const plan = computeRolloverPlan([], 2026, [], TEAMS)
  const r1 = plan.newPicks.find((p) => p.currentTeamName === 'Jared' && p.round === 1)
  const r2 = plan.newPicks.find((p) => p.currentTeamName === 'Jared' && p.round === 2)
  assert.deepEqual(r1.prices, { 2027: 2, 2028: 7, 2029: 17 })
  assert.deepEqual(r2.prices, { 2027: 1, 2028: 6, 2029: 16 })
})

test('flags the history reminder only when the completed season is not yet archived', () => {
  const withHistory = computeRolloverPlan([], 2026, [2025], TEAMS)
  const withoutHistory = computeRolloverPlan([], 2026, [2024], TEAMS)
  assert.equal(withHistory.historyReminder, false)
  assert.equal(withoutHistory.historyReminder, true)
})

test('fromSeason/toSeason are reported correctly on the plan', () => {
  const plan = computeRolloverPlan([], 2027, [], TEAMS)
  assert.equal(plan.fromSeason, 2026)
  assert.equal(plan.toSeason, 2027)
})
