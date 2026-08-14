import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  contractYear, nextPrice, priceInSeason, projectPrices,
  countsTowardCap, waiverResetValue, validatePrices, repairedPrices,
  teamCapTotal, tradeCapImpact,
} from './contracts.js'

/* ── The formula against the handbook's worked examples ─────── */

test('$1 rookie escalates $1 → $6 → $16 → $31', () => {
  assert.equal(nextPrice(1, 1), 6)
  assert.equal(nextPrice(6, 2), 16)
  assert.equal(nextPrice(16, 3), 31)
})

test('waiver keeper enters at $2 and escalates to $7 regardless of FAAB bid', () => {
  // $50 drafted → dropped → cleared → FAAB'd for $10, and an undrafted $15
  // FAAB pickup, both land at the same flat keeper value...
  assert.equal(waiverResetValue(), 2)
  // ...and both project to $7 the year after being kept
  assert.equal(nextPrice(waiverResetValue(), 1), 7)
})

test('contract year counts from the purchase season', () => {
  assert.equal(contractYear(2024, 2024), 1)
  assert.equal(contractYear(2024, 2025), 2)
  assert.equal(contractYear(2022, 2027), 6)
})

test('priceInSeason chains multiple years', () => {
  // Romeo Doubs: FA'd 2024 at $2 → $7 (2025) → $17 (2026) → $32 (2027)
  assert.equal(priceInSeason(2, 2024, 2024, 2025), 7)
  assert.equal(priceInSeason(2, 2024, 2024, 2026), 17)
  assert.equal(priceInSeason(2, 2024, 2024, 2027), 32)
  assert.equal(priceInSeason(2, 2024, 2024, 2023), null)
})

/* ── The full 2025 Keeper Master CSV as a fixture ───────────── */

const csvPath = fileURLToPath(new URL('../../../2025 Keeper Master.csv', import.meta.url))
const rows = readFileSync(csvPath, 'utf8')
  .split('\n')
  .slice(1)
  .map((line) => line.split(','))
  .filter((c) => c.length >= 10 && c[3]?.trim())
  .map((c) => ({
    team: c[0].trim(),
    name: c[2].trim(),
    p2025: Number(c[3].replace(/[^0-9.-]/g, '')),
    p2026: Number(c[4].replace(/[^0-9.-]/g, '')),
    p2027: Number(c[5].replace(/[^0-9.-]/g, '')),
    original: Number(c[6].replace(/[^0-9.-]/g, '')),
    purchaseYear: Number(c[7]),
    contractYear: Number(c[8]),
    pool: c[9].trim(),
  }))
  // Players only — draft-pick rows carry no purchase year and price by
  // rookie-slot rules ($2/$1), not the escalation formula
  .filter((r) => Number.isFinite(r.p2025) && r.purchaseYear > 2000)

test('CSV fixture loads the full roster set', () => {
  assert.ok(rows.length >= 230, `expected ≥230 rows, got ${rows.length}`)
})

test("CSV: every row's contract year matches the derived formula", () => {
  const bad = rows.filter((r) => contractYear(r.purchaseYear, 2025) !== r.contractYear)
  assert.deepEqual(bad.map((r) => r.name), [])
})

test('CSV: every 2026 and 2027 price follows next = current + $5 × contract year', () => {
  const bad = []
  for (const r of rows) {
    const e26 = nextPrice(r.p2025, contractYear(r.purchaseYear, 2025))
    const e27 = nextPrice(e26, contractYear(r.purchaseYear, 2026))
    if (r.p2026 !== e26) bad.push(`${r.name}: 2026 ${r.p2026} ≠ ${e26}`)
    if (r.p2027 !== e27) bad.push(`${r.name}: 2027 ${r.p2027} ≠ ${e27}`)
  }
  assert.deepEqual(bad, [])
})

/* ── Projection (KeeperBuilder past the stored map) ─────────── */

test('projectPrices extends beyond the stored 3-year map through Y6', () => {
  const player = {
    prices: { 2026: 17 }, originalPrice: 2, purchaseYear: 2024, playerPool: 'Free Agent',
  }
  const proj = projectPrices(player, 2026)
  // 2026 = Y3 at $17, Y4 $32, Y5 $52, Y6 $77 — then stops (practical max)
  assert.deepEqual(proj, { 2026: 17, 2027: 32, 2028: 52, 2029: 77 })
})

test('projectPrices still returns the current season for a player past Y6', () => {
  const veteran = { prices: { 2026: 90 }, originalPrice: 10, purchaseYear: 2019 }
  assert.deepEqual(projectPrices(veteran, 2026), { 2026: 90 })
})

/* ── Cap membership ─────────────────────────────────────────── */

test('in-season waiver pickup is cap-exempt; kept FA counts', () => {
  const pickedUpNow = { playerPool: 'Free Agent', purchaseYear: 2026 }
  const keptFA = { playerPool: 'Free Agent', purchaseYear: 2024 }
  const auction = { playerPool: 'Auction', purchaseYear: 2026 }
  const rookie = { playerPool: 'Rookie Draft', purchaseYear: 2026 }
  assert.equal(countsTowardCap(pickedUpNow, 2026), false)
  assert.equal(countsTowardCap(keptFA, 2026), true)
  assert.equal(countsTowardCap(auction, 2026), true)
  assert.equal(countsTowardCap(rookie, 2026), true)
})

/* ── TAX DAT ASS cap math ───────────────────────────────────── */

const CAP_ASSETS = [
  { teamName: 'Jared', isPick: false, currentPrice: 100, playerPool: 'Auction', purchaseYear: 2024 },
  { teamName: 'Jared', isPick: false, currentPrice: 150, playerPool: 'Auction', purchaseYear: 2025 },
  { teamName: 'Jared', isPick: false, currentPrice: 40, playerPool: 'Free Agent', purchaseYear: 2026 },  // in-season pickup — exempt
  { teamName: 'Jared', isPick: true, currentPrice: 8, playerPool: 'Rookie Draft' },                       // pick — exempt
  { teamName: 'Jared', isPick: false, currentPrice: 60, playerPool: 'Auction', purchaseYear: 2024, salaryStatus: 'dropped_pending' }, // dropped — off the cap
  { teamName: 'Bill', isPick: false, currentPrice: 280, playerPool: 'Auction', purchaseYear: 2025 },
]

test('teamCapTotal counts drafted/kept rostered salary only', () => {
  assert.equal(teamCapTotal(CAP_ASSETS, 'Jared', 2026), 250) // 100 + 150
  assert.equal(teamCapTotal(CAP_ASSETS, 'Bill', 2026), 280)
})

test('tradeCapImpact projects both sides and flags a $300 breach', () => {
  const fromJared = [CAP_ASSETS[0]] // $100 out
  const fromBill = [{ teamName: 'Bill', isPick: false, currentPrice: 130, playerPool: 'Auction', purchaseYear: 2025 }]
  const impact = tradeCapImpact(CAP_ASSETS, 2026, 'Jared', 'Bill', fromJared, fromBill)
  assert.deepEqual(impact.proposer, { before: 250, after: 280 }) // 250 - 100 + 130
  assert.deepEqual(impact.receiver, { before: 280, after: 250 })
  // Jared at 280 is safe; a bigger incoming piece would breach
  const breach = tradeCapImpact(CAP_ASSETS, 2026, 'Jared', 'Bill', [], fromBill)
  assert.equal(breach.proposer.after, 380)
  assert.ok(breach.proposer.after > 300)
})

test('picks and exempt pickups are worth $0 in trade cap math', () => {
  const impact = tradeCapImpact(
    CAP_ASSETS, 2026, 'Jared', 'Bill',
    [CAP_ASSETS[3]], // sending a pick out — no cap change
    [],
  )
  assert.equal(impact.proposer.after, impact.proposer.before)
})

/* ── Validation + repair ────────────────────────────────────── */

test('validatePrices is clean for a formula-correct player', () => {
  const p = { prices: { 2025: 9, 2026: 19, 2027: 34 }, originalPrice: 4, purchaseYear: 2024 }
  assert.deepEqual(validatePrices(p), [])
})

test('validatePrices flags drifted seasons with the expected value', () => {
  const p = { prices: { 2025: 9, 2026: 20, 2027: 35 }, originalPrice: 4, purchaseYear: 2024 }
  const problems = validatePrices(p)
  assert.deepEqual(problems[0], { season: 2026, stored: 20, expected: 19 })
  // 2027 is judged against the STORED 2026 (20 + 5×3 = 35) so a single
  // drift doesn't cascade into phantom errors
  assert.equal(problems.length, 1)
})

test('validatePrices anchors on originalPrice at the purchase season', () => {
  const p = { prices: { 2024: 5, 2025: 9 }, originalPrice: 4, purchaseYear: 2024 }
  const problems = validatePrices(p)
  assert.deepEqual(problems[0], { season: 2024, stored: 5, expected: 4 })
})

test('repairedPrices rebuilds the chain from the earliest stored season', () => {
  const p = { prices: { 2025: 9, 2026: 20, 2027: 35 }, originalPrice: 4, purchaseYear: 2024 }
  assert.deepEqual(repairedPrices(p), { 2025: 9, 2026: 19, 2027: 34 })
})
