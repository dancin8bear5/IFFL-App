import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  toRookieRecords, toAuctionRecords, toTradeRecords, buildIndex,
  tokenize, scoreRecord, searchHistory, seasonsIn, KINDS,
} from './historySearch.js'

const ROOKIE = {
  2018: [
    { name: 'Saquon Barkley', position: 'RB', nflTeam: 'NYG', team: 'Jared', price: 12, slot: '1.01', round: 1 },
    { name: null, position: null, nflTeam: null, team: null, price: null, slot: '1.03', round: 1, dropped: true },
  ],
  2022: [
    { name: 'Breece Hall', position: 'RB', nflTeam: 'NYJ', team: 'Abad', price: 2, slot: null, round: 1 },
  ],
}

const AUCTION = [
  { season: 2022, picks: [
    { team: 'Bill', player: 'Justin Jefferson', position: 'WR', proTeam: 'Min', round: 1, overallPick: 1, auctionPrice: 62, keeper: true },
    { team: 'Jared', player: 'Marshall Faulk', position: 'RB', proTeam: 'StL', round: 2, overallPick: 14, auctionPrice: 8, keeper: false },
  ] },
]

const TRADES = [
  { id: 't1', season: 2022, status: 'historical', proposingTeamName: 'Jared', receivingTeamName: 'Bill',
    assetsFromProposer: [{ displayName: 'Dak Prescott' }],
    assetsFromReceiver: [{ displayName: 'Breece Hall' }, { displayName: '2027 2nd (Jason)' }],
    date: new Date('2022-09-01') },
  { id: 't2', season: 2022, status: 'proposed', proposingTeamName: 'Foley', receivingTeamName: 'Dugan',
    assetsFromProposer: [], assetsFromReceiver: [], date: new Date('2022-10-01') },
]

// ── adapters ───────────────────────────────────────────────────

test('a rookie class becomes one record per pick', () => {
  const recs = toRookieRecords(ROOKIE)
  assert.equal(recs.length, 3)
  assert.ok(recs.every((r) => r.kind === 'rookie'))
  const saquon = recs.find((r) => r.title === 'Saquon Barkley')
  assert.equal(saquon.season, 2018)
  assert.equal(saquon.slot, '1.01')
  assert.deepEqual(saquon.teams, ['Jared'])
})

test('a dropped pick stays in the index — the slot is still a fact', () => {
  // "Who held 2018's 1.03" has an answer even though the player is gone.
  const dropped = toRookieRecords(ROOKIE).find((r) => r.raw.dropped)
  assert.match(dropped.title, /1\.03/)
  assert.match(dropped.title, /dropped/)
  assert.deepEqual(dropped.players, [])
})

test('auction picks carry their price and keeper status', () => {
  const recs = toAuctionRecords(AUCTION)
  assert.equal(recs.length, 2)
  const jj = recs.find((r) => r.title === 'Justin Jefferson')
  assert.equal(jj.price, 62)
  assert.equal(jj.keeper, true)
  assert.equal(jj.season, 2022)
})

test('a trade is one record, not one per side', () => {
  const recs = toTradeRecords(TRADES)
  assert.equal(recs.length, 1)
  assert.deepEqual(recs[0].teams, ['Jared', 'Bill'])
  assert.equal(recs[0].players.length, 3)
})

test('a trade nobody agreed to is not history', () => {
  // Proposed, cancelled and rejected offers never happened; indexing them
  // would put deals that were turned down into the record.
  const recs = toTradeRecords(TRADES)
  assert.ok(!recs.some((r) => r.raw.id === 't2'))
  assert.equal(toTradeRecords([{ id: 'x', status: 'cancelled' }]).length, 0)
  assert.equal(toTradeRecords([{ id: 'y', status: 'rejected' }]).length, 0)
})

test('every source is optional — an unseeded one contributes nothing', () => {
  assert.deepEqual(buildIndex({}), [])
  assert.deepEqual(buildIndex(), [])
  assert.equal(buildIndex({ rookie: ROOKIE }).length, 3)
})

test('ids are unique across every kind', () => {
  const idx = buildIndex({ rookie: ROOKIE, auction: AUCTION, trades: TRADES })
  assert.equal(new Set(idx.map((r) => r.id)).size, idx.length)
})

// ── query parsing ──────────────────────────────────────────────

test('tokenizing ignores case, commas and extra spacing', () => {
  assert.deepEqual(tokenize('  Breece  Hall '), ['breece', 'hall'])
  assert.deepEqual(tokenize('Jared, Bill'), ['jared', 'bill'])
  assert.deepEqual(tokenize(''), [])
  assert.deepEqual(tokenize(null), [])
})

// ── ranking ────────────────────────────────────────────────────

const IDX = buildIndex({ rookie: ROOKIE, auction: AUCTION, trades: TRADES })

test('an empty query matches everything', () => {
  assert.ok(IDX.every((r) => scoreRecord(r, []) > 0))
})

test('every term must match — more words narrows, never widens', () => {
  const hall = IDX.find((r) => r.title === 'Breece Hall' && r.kind === 'rookie')
  assert.ok(scoreRecord(hall, ['breece']) > 0)
  assert.ok(scoreRecord(hall, ['breece', '2022']) > 0)
  assert.equal(scoreRecord(hall, ['breece', '1999']), 0)
})

test('a name match outranks the same word buried elsewhere', () => {
  // "faulk" is the player; "Marshall" appears only as a pro team. Someone
  // typing a player name wants the player.
  const faulk = IDX.find((r) => r.title === 'Marshall Faulk')
  const scoreOnName = scoreRecord(faulk, ['faulk'])
  const scoreOnTeam = scoreRecord(faulk, ['stl'])
  assert.ok(scoreOnName > scoreOnTeam, `${scoreOnName} should beat ${scoreOnTeam}`)
})

// ── searching ──────────────────────────────────────────────────

test('a player search finds him in every kind of record at once', () => {
  const { results } = searchHistory(IDX, { text: 'breece hall' })
  const kinds = new Set(results.map((r) => r.kind))
  assert.ok(kinds.has('rookie'), 'his rookie pick')
  assert.ok(kinds.has('trade'), 'the trade he was in')
})

test('the kind filter narrows the results but not the counts', () => {
  // The chips have to keep showing what the other kinds hold, or picking
  // one makes the rest read as empty and the user thinks they lost data.
  const all = searchHistory(IDX, { text: 'breece hall' })
  const one = searchHistory(IDX, { text: 'breece hall', kinds: ['trade'] })
  assert.ok(one.results.every((r) => r.kind === 'trade'))
  assert.deepEqual(one.counts, all.counts)
  assert.ok(one.counts.rookie > 0)
})

test('season bounds are inclusive', () => {
  assert.equal(searchHistory(IDX, { seasonFrom: 2018, seasonTo: 2018 }).results.every((r) => r.season === 2018), true)
  assert.equal(searchHistory(IDX, { seasonFrom: 2019 }).results.some((r) => r.season === 2018), false)
  assert.equal(searchHistory(IDX, { seasonTo: 2017 }).total, 0)
})

test('a team filter matches either side of a trade', () => {
  const asProposer = searchHistory(IDX, { teams: ['Jared'], kinds: ['trade'] })
  const asReceiver = searchHistory(IDX, { teams: ['Bill'], kinds: ['trade'] })
  assert.equal(asProposer.total, 1)
  assert.equal(asReceiver.total, 1)
})

test('a position filter leaves trades out rather than matching them all', () => {
  // Trades carry no position, so a position filter is a question they
  // can't answer — they must drop out, not sail through.
  const { results } = searchHistory(IDX, { positions: ['RB'] })
  assert.ok(results.length > 0)
  assert.ok(results.every((r) => r.kind !== 'trade'))
})

test('results are ordered by relevance, then by recency', () => {
  const { results } = searchHistory(IDX, { text: 'rb' })
  const seasons = results.map((r) => r.season)
  assert.deepEqual([...seasons].sort((a, b) => b - a), seasons)
})

test('the same query twice returns the same order', () => {
  // Two equally-scored records must not swap places between renders.
  const a = searchHistory(IDX, { text: '2022' }).results.map((r) => r.id)
  const b = searchHistory(IDX, { text: '2022' }).results.map((r) => r.id)
  assert.deepEqual(a, b)
})

test('a miss is empty rather than everything', () => {
  const { results, total } = searchHistory(IDX, { text: 'zzzznobody' })
  assert.equal(results.length, 0)
  assert.equal(total, 0)
})

test('the browse list is capped but the total still tells the truth', () => {
  const big = Array.from({ length: 50 }, (_, i) => ({
    id: `x${i}`, kind: 'auction', season: 2020, date: null,
    teams: [], players: [], positions: [], haystack: 'x', title: 'x',
  }))
  const { results, total } = searchHistory(big, { limit: 10 })
  assert.equal(results.length, 10)
  assert.equal(total, 50)
})

test('searching an empty index is empty, not a crash', () => {
  const { results, total, counts } = searchHistory([], { text: 'anything' })
  assert.deepEqual(results, [])
  assert.equal(total, 0)
  assert.deepEqual(Object.keys(counts).sort(), [...KINDS].sort())
})

test('seasons come back newest first, deduplicated', () => {
  assert.deepEqual(seasonsIn(IDX), [2022, 2018])
  assert.deepEqual(seasonsIn([]), [])
})
