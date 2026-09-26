import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parseKeeperCSV, diffKeeperImport, keeperDocId } from './keeperImport.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REAL_CSV = readFileSync(join(__dirname, 'fixtures/keeperMaster2025.csv'), 'utf8')

test('parses the real 2025 Keeper Master CSV end to end', () => {
  const { rows, pickRows, errors } = parseKeeperCSV(REAL_CSV, 2025)
  assert.equal(errors.length, 0)
  assert.equal(pickRows, 48) // Draft Pick rows, skipped — picks reconcile separately
  assert.equal(rows.length, 231) // 279 data lines minus 48 picks
  const sam = rows.find((r) => r.name === 'Sam Darnold')
  assert.deepEqual(sam.prices, { 2025: 9, 2026: 19, 2027: 34 })
  assert.equal(sam.originalPrice, 4)
  assert.equal(sam.purchaseYear, 2024)
  assert.equal(sam.contractYearsRemaining, 2)
  assert.equal(sam.playerPool, 'Auction')
  assert.equal(sam.team, 'A. Zurek')
  assert.equal(sam.position, 'QB')
})

test('strips $ signs, trailing parens, and whitespace from money cells', () => {
  const csv = 'Team,Position,Player,2026 Price,2027 Price,2028 Price,Original Price,Purchase Year,Contract Year,Player Pool\n' +
    'Jared,QB,Test Guy,$9) ,$19) ,$34) ,$4 ,2024,2,Auction'
  const { rows, errors } = parseKeeperCSV(csv, 2026)
  assert.equal(errors.length, 0)
  assert.deepEqual(rows[0].prices, { 2026: 9, 2027: 19, 2028: 34 })
  assert.equal(rows[0].originalPrice, 4)
})

test('skips Draft Pick rows and counts them separately', () => {
  const csv = 'Team,Position,Player,2026 Price,2027 Price,2028 Price,Original Price,Purchase Year,Contract Year,Player Pool\n' +
    'Jared,Draft Pick,2026 1.09,$2,$7,$17,$2,2026,1,Draft Pick\n' +
    'Jared,QB,Real Player,$9,$19,$34,$4,2024,2,Auction'
  const { rows, pickRows, errors } = parseKeeperCSV(csv, 2026)
  assert.equal(errors.length, 0)
  assert.equal(pickRows, 1)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].name, 'Real Player')
})

test('flags missing required columns instead of parsing garbage', () => {
  const { rows, errors } = parseKeeperCSV('Team,Player\nJared,Bob', 2026)
  assert.equal(rows.length, 0)
  assert.ok(errors[0].message.includes('Position'))
})

test('flags a row with no price for the active season', () => {
  const csv = 'Team,Position,Player,2026 Price,Original Price,Purchase Year,Contract Year,Player Pool\n' +
    'Jared,QB,No Price Guy,,$4,2024,2,Auction'
  const { rows, errors } = parseKeeperCSV(csv, 2026)
  assert.equal(rows.length, 0)
  assert.ok(errors.some((e) => e.message.includes('No Price Guy')))
})

test('handles a quoted Trade History cell with embedded commas', () => {
  const csv = 'Team,Position,Player,2026 Price,2027 Price,2028 Price,Original Price,Purchase Year,Contract Year,Player Pool,Trade History\n' +
    'Jared,WR,Traded Guy,$9,$19,$34,$4,2024,2,Auction,"via Cantone, Faybik"'
  const { rows } = parseKeeperCSV(csv, 2026)
  assert.equal(rows[0].tradeNote, 'via Cantone, Faybik')
})

test('keeperDocId is stable across whitespace/case and stays the same when a player is traded', () => {
  assert.equal(keeperDocId('Sam Darnold', 'QB'), keeperDocId('  sam darnold  ', 'qb'))
  assert.notEqual(keeperDocId('Bob', 'QB'), keeperDocId('Bob', 'RB'))
})

// ── diffKeeperImport ─────────────────────────────────────────

const player = (over) => ({
  id: 'p1', name: 'Sam Darnold', teamName: 'A. Zurek', position: 'QB',
  prices: { 2025: 9, 2026: 19, 2027: 34 }, originalPrice: 4, purchaseYear: 2024,
  contractYearsRemaining: 2, playerPool: 'Auction', isActive: true, isPick: false,
  ...over,
})

test('unchanged row when every owned field matches exactly', () => {
  const { rows } = parseKeeperCSV(REAL_CSV, 2025)
  const sam = rows.find((r) => r.name === 'Sam Darnold')
  const diff = diffKeeperImport([sam], [player()], 2025)
  assert.equal(diff.unchanged.length, 1)
  assert.equal(diff.added.length, 0)
  assert.equal(diff.changed.length, 0)
})

test('a new team+name combination is added, not matched to an unrelated player', () => {
  const csv = 'Team,Position,Player,2026 Price,2027 Price,2028 Price,Original Price,Purchase Year,Contract Year,Player Pool\n' +
    'Jared,RB,Brand New Guy,$2,$7,$17,$2,2026,1,Auction'
  const { rows } = parseKeeperCSV(csv, 2026)
  const diff = diffKeeperImport(rows, [player()], 2026)
  assert.equal(diff.added.length, 1)
  assert.equal(diff.added[0].name, 'Brand New Guy')
})

test('a price change is flagged with the specific season field', () => {
  const csv = 'Team,Position,Player,2025 Price,2026 Price,2027 Price,Original Price,Purchase Year,Contract Year,Player Pool\n' +
    'A. Zurek,QB,Sam Darnold,$15,$19,$34,$4,2024,2,Auction' // 2025 price drifted from $9 to $15
  const { rows } = parseKeeperCSV(csv, 2025)
  const diff = diffKeeperImport(rows, [player()], 2025)
  assert.equal(diff.changed.length, 1)
  assert.ok(diff.changed[0].changedFields.includes('prices.2025'))
})

test('a team change (trade) is flagged', () => {
  const csv = 'Team,Position,Player,2025 Price,2026 Price,2027 Price,Original Price,Purchase Year,Contract Year,Player Pool\n' +
    'Bill,QB,Sam Darnold,$9,$19,$34,$4,2024,2,Auction'
  const { rows } = parseKeeperCSV(csv, 2025)
  const diff = diffKeeperImport(rows, [player()], 2025)
  assert.equal(diff.changed.length, 1)
  assert.ok(diff.changed[0].changedFields.includes('team'))
})

test('a rostered player absent from the sheet shows up as missing, and picks are excluded', () => {
  const roster = [player(), player({ id: 'p2', name: 'Only In App', assetId: 'x' }), { id: 'pk1', isPick: true, name: 'ignored pick', teamName: 'Bill' }]
  const diff = diffKeeperImport([], roster, 2025)
  assert.equal(diff.missing.length, 2)
  assert.ok(diff.missing.every((m) => !m.isPick))
})

test('inactive (deactivated) players are excluded from missing entirely', () => {
  const roster = [player(), player({ id: 'p2', name: 'Retired Guy', isActive: false })]
  const diff = diffKeeperImport([], roster, 2025)
  assert.equal(diff.missing.length, 1)
  assert.equal(diff.missing[0].name, 'Sam Darnold')
})

test('flags a team over the $300 cap using the imported sheet totals', () => {
  const csv = 'Team,Position,Player,2026 Price,2027 Price,2028 Price,Original Price,Purchase Year,Contract Year,Player Pool\n' +
    'Jared,QB,A,$200,$205,$210,$200,2026,1,Auction\n' +
    'Jared,RB,B,$150,$155,$160,$150,2026,1,Auction'
  const { rows } = parseKeeperCSV(csv, 2026)
  const diff = diffKeeperImport(rows, [], 2026)
  assert.equal(diff.overCap.length, 1)
  assert.equal(diff.overCap[0].team, 'Jared')
  assert.equal(diff.overCap[0].total, 350)
})

test('full real-CSV import against an empty roster is entirely additions, nothing missing', () => {
  const { rows } = parseKeeperCSV(REAL_CSV, 2025)
  const diff = diffKeeperImport(rows, [], 2025)
  assert.equal(diff.added.length, rows.length)
  assert.equal(diff.changed.length, 0)
  assert.equal(diff.missing.length, 0)
})
