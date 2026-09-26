import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pickPricesFromOwnSeason, pickToDisplayAsset, playerToDisplayAsset } from './models.js'

// A 2027 pick whose stored map also carries a 2026 figure — which is what
// the rollover writes, and what made future picks show up against the
// current year's cap.
const pick2027 = {
  id: 'dp1',
  season: 2027,
  round: 1,
  slot: null,
  currentTeamName: 'Jared',
  originalTeamName: 'Cantone',
  prices: { 2026: 8, 2027: 8, 2028: 13 },
}

test('a future pick is worth nothing in the current season', () => {
  const a = pickToDisplayAsset(pick2027, 2026)
  assert.equal(a.currentPrice, 0)
  assert.equal(a.prices['2026'], 0)
})

test('...and is worth its real price once its own season arrives', () => {
  assert.equal(pickToDisplayAsset(pick2027, 2027).currentPrice, 8)
  assert.equal(pickToDisplayAsset(pick2027, 2028).currentPrice, 13)
})

test('only seasons BEFORE the pick are zeroed, never its own or later', () => {
  const p = pickPricesFromOwnSeason(pick2027)
  assert.deepEqual(p, { 2026: 0, 2027: 8, 2028: 13 })
})

test('originalPrice still reads the pick\'s own season', () => {
  // It is the pick's face value, not a current-year cost, so zeroing the
  // earlier years must not touch it.
  assert.equal(pickToDisplayAsset(pick2027, 2026).originalPrice, 8)
})

test('a pick for the current season is unaffected', () => {
  const now = { id: 'dp9', season: 2026, round: 2, currentTeamName: 'Bill', prices: { 2026: 2, 2027: 7 } }
  assert.equal(pickToDisplayAsset(now, 2026).currentPrice, 2)
  assert.equal(pickToDisplayAsset(now, 2027).currentPrice, 7)
})

test('a pick with no prices or no season degrades to zero, not a crash', () => {
  assert.deepEqual(pickPricesFromOwnSeason({}), {})
  assert.deepEqual(pickPricesFromOwnSeason(null), {})
  assert.equal(pickToDisplayAsset({ id: 'x', season: 2027, currentTeamName: 'Bill' }, 2026).currentPrice, 0)
  // A malformed pick with no season keeps whatever it had rather than
  // silently zeroing a real price on a guess.
  assert.deepEqual(pickPricesFromOwnSeason({ prices: { 2026: 5 } }), { 2026: 5 })
})

test('players are not touched by any of this', () => {
  const p = { id: 'p1', teamName: 'Jared', name: 'Bijan', position: 'RB', prices: { 2026: 32, 2027: 42 } }
  assert.equal(playerToDisplayAsset(p, 2026).currentPrice, 32)
  assert.equal(playerToDisplayAsset(p, 2026).prices['2026'], 32)
})
