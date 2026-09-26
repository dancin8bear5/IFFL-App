import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  indexRows, tokenize, matchesText, optionsFor, applyFilters,
  sortRows, queryRows, toCSV, exportFilename, searchableKeys,
} from './historyTable.js'

const COLUMNS = [
  { key: 'season', label: 'Season', type: 'season', filter: 'select' },
  { key: 'player', label: 'Player', type: 'text', search: true },
  { key: 'team', label: 'Team', type: 'text', search: true, filter: 'select' },
  { key: 'price', label: 'Price', type: 'number', filter: 'range' },
  { key: 'secret', label: 'Secret', type: 'text', export: false },
]

const ROWS = indexRows([
  { season: 2022, player: 'Breece Hall', team: 'Abad', price: 2, secret: 'x' },
  { season: 2010, player: 'Marshall Faulk', team: 'Bill', price: 40, secret: 'y' },
  { season: 2024, player: 'Bo Nix', team: 'Faybik', price: 17, secret: 'z' },
  { season: 2024, player: 'Ladd McConkey', team: 'Bill', price: null, secret: '' },
], COLUMNS)

// ── declaration drives everything ──────────────────────────────

test('only columns marked searchable feed the text index', () => {
  assert.deepEqual(searchableKeys(COLUMNS), ['player', 'team'])
  // 'x' is in `secret`, which is not searchable — it must not match.
  assert.equal(matchesText(ROWS[0], tokenize('x')), false)
  assert.equal(matchesText(ROWS[0], tokenize('breece')), true)
})

test('the index is built once, not per keystroke', () => {
  assert.ok(ROWS.every((r) => typeof r._hay === 'string'))
  assert.equal(ROWS[0]._hay, 'breece hall abad')
})

test('every term must match — more words narrow', () => {
  assert.equal(matchesText(ROWS[0], tokenize('breece abad')), true)
  assert.equal(matchesText(ROWS[0], tokenize('breece bill')), false)
  assert.equal(matchesText(ROWS[0], []), true)
})

// ── filters ────────────────────────────────────────────────────

test('an untouched control removes nothing', () => {
  assert.equal(applyFilters(ROWS, COLUMNS, {}).length, 4)
  assert.equal(applyFilters(ROWS, COLUMNS, { team: '' }).length, 4)
  assert.equal(applyFilters(ROWS, COLUMNS, { price: { min: '', max: '' } }).length, 4)
})

test('a select filter matches exactly', () => {
  assert.equal(applyFilters(ROWS, COLUMNS, { team: 'Bill' }).length, 2)
  // Season values are numbers in the data and strings off a <select>.
  assert.equal(applyFilters(ROWS, COLUMNS, { season: '2024' }).length, 2)
  assert.equal(applyFilters(ROWS, COLUMNS, { season: 2024 }).length, 2)
})

test('filters combine — each one narrows further', () => {
  assert.equal(applyFilters(ROWS, COLUMNS, { season: 2024, team: 'Bill' }).length, 1)
})

test('a range filter is inclusive at both ends', () => {
  assert.equal(applyFilters(ROWS, COLUMNS, { price: { min: 2, max: 17 } }).length, 2)
  assert.equal(applyFilters(ROWS, COLUMNS, { price: { min: 17, max: '' } }).length, 2)
  assert.equal(applyFilters(ROWS, COLUMNS, { price: { min: '', max: 2 } }).length, 1)
})

test('a row with no value drops out of a range rather than counting as zero', () => {
  // McConkey has a null price. Treating that as 0 would sweep him into
  // every "cheap" query and quietly corrupt the answer.
  const cheap = applyFilters(ROWS, COLUMNS, { price: { min: '', max: 5 } })
  assert.ok(!cheap.some((r) => r.player === 'Ladd McConkey'))
})

test('select options come back deduplicated and usefully ordered', () => {
  // Seasons newest first; teams alphabetical.
  assert.deepEqual(optionsFor(ROWS, COLUMNS[0]), [2024, 2022, 2010])
  assert.deepEqual(optionsFor(ROWS, COLUMNS[2]), ['Abad', 'Bill', 'Faybik'])
  assert.deepEqual(optionsFor([], COLUMNS[0]), [])
})

// ── sorting ────────────────────────────────────────────────────

test('seasons sort numerically, not as text', () => {
  // As strings "2010" > "2009" happens to work, but numeric is the only
  // thing that stays right once a column holds 9 and 10.
  const asc = sortRows(ROWS, COLUMNS, { key: 'season', dir: 'asc' }).map((r) => r.season)
  assert.deepEqual(asc, [2010, 2022, 2024, 2024])
})

test('text sorts alphabetically both ways', () => {
  const asc = sortRows(ROWS, COLUMNS, { key: 'player', dir: 'asc' }).map((r) => r.player)
  assert.equal(asc[0], 'Bo Nix')
  const desc = sortRows(ROWS, COLUMNS, { key: 'player', dir: 'desc' }).map((r) => r.player)
  assert.equal(desc[0], 'Marshall Faulk')
})

test('blanks sink to the bottom in BOTH directions', () => {
  // A missing price is absent, not smallest. Floating it to the top on a
  // descending sort would bury the rows someone asked to see.
  for (const dir of ['asc', 'desc']) {
    const out = sortRows(ROWS, COLUMNS, { key: 'price', dir })
    assert.equal(out.at(-1).player, 'Ladd McConkey', `dir=${dir}`)
  }
})

test('sorting is stable enough not to jitter and never mutates the input', () => {
  const before = ROWS.map((r) => r.player)
  sortRows(ROWS, COLUMNS, { key: 'season', dir: 'asc' })
  assert.deepEqual(ROWS.map((r) => r.player), before)
  assert.equal(sortRows(ROWS, COLUMNS, null), ROWS)
  assert.deepEqual(sortRows(ROWS, COLUMNS, { key: 'nope', dir: 'asc' }), ROWS)
})

// ── the pipeline ───────────────────────────────────────────────

test('filter, search and sort compose', () => {
  const out = queryRows(ROWS, COLUMNS, {
    text: 'bill', filters: { season: 2024 }, sort: { key: 'player', dir: 'asc' },
  })
  assert.deepEqual(out.map((r) => r.player), ['Ladd McConkey'])
})

test('a query matching nothing is empty, not everything', () => {
  assert.deepEqual(queryRows(ROWS, COLUMNS, { text: 'nobody' }), [])
})

test('an empty query returns everything untouched', () => {
  assert.equal(queryRows(ROWS, COLUMNS, {}).length, 4)
})

// ── export ─────────────────────────────────────────────────────

test('the CSV matches the table — same columns, same order', () => {
  const csv = toCSV(ROWS.slice(0, 1), COLUMNS)
  const [head, row] = csv.trim().split('\n')
  // `secret` is export:false, so it appears in neither.
  assert.equal(head, 'Season,Player,Team,Price')
  assert.equal(row, '2022,Breece Hall,Abad,2')
})

test('a value containing a comma or a quote survives the round trip', () => {
  const rows = [{ season: 2020, player: 'Smith, Jr.', team: 'He said "hi"', price: 1 }]
  const csv = toCSV(rows, COLUMNS)
  assert.match(csv, /"Smith, Jr\."/)
  assert.match(csv, /"He said ""hi"""/)
})

test('a blank cell exports as empty, not as "null"', () => {
  const csv = toCSV([{ season: 2024, player: 'X', team: null, price: undefined }], COLUMNS)
  assert.equal(csv.trim().split('\n')[1], '2024,X,,')
})

test('a column formatter applies to the export too', () => {
  const cols = [{ key: 'price', label: 'Price', format: (v) => (v == null ? '' : `$${v}`) }]
  assert.match(toCSV([{ price: 12 }], cols), /\$12/)
})

test('exporting nothing still writes a header row', () => {
  assert.equal(toCSV([], COLUMNS).trim(), 'Season,Player,Team,Price')
})

test('the filename records what was exported', () => {
  assert.equal(exportFilename('auction', { filters: { season: 2024, team: 'Bill' } }),
    'iffl-auction-2024-bill.csv')
  assert.equal(exportFilename('trades', { text: 'breece hall' }), 'iffl-trades-breece-hall.csv')
  assert.equal(exportFilename('games', { scope: 'all' }), 'iffl-games-all.csv')
  assert.equal(exportFilename('standings'), 'iffl-standings.csv')
})

test('a filename never carries characters a filesystem would refuse', () => {
  const name = exportFilename('trades', { text: 'Ja\'Marr / Chase?', filters: { team: 'A. Zurek' } })
  assert.match(name, /^[a-z0-9._-]+\.csv$/)
})

test('a range filter reads as a range in the filename', () => {
  assert.equal(exportFilename('auction', { filters: { price: { min: 10, max: 40 } } }),
    'iffl-auction-price10-40.csv')
  assert.equal(exportFilename('auction', { filters: { price: { min: '', max: '' } } }),
    'iffl-auction.csv')
})
