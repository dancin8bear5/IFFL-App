import test from 'node:test'
import assert from 'node:assert/strict'
import { withOwnedRanks, posRankLabel } from './ownedRank.js'

const player = (assetId, position, currentPrice, extra = {}) => ({
  assetId, position, currentPrice, isPick: false, playerPool: 'Keeper', ...extra,
})

test('ranks owned players by current price, highest first', () => {
  const out = withOwnedRanks([
    player('a', 'RB', 40),
    player('b', 'WR', 88),
    player('c', 'QB', 12),
  ])
  const byId = Object.fromEntries(out.map((a) => [a.assetId, a]))
  assert.equal(byId.b.ownedRank, 1)
  assert.equal(byId.a.ownedRank, 2)
  assert.equal(byId.c.ownedRank, 3)
  assert.equal(byId.a.ownedRankTotal, 3)
})

test('ties share a rank and the next rank skips (competition ranking)', () => {
  const out = withOwnedRanks([
    player('a', 'RB', 50),
    player('b', 'WR', 30),
    player('c', 'TE', 30),
    player('d', 'QB', 10),
  ])
  const byId = Object.fromEntries(out.map((a) => [a.assetId, a]))
  assert.equal(byId.a.ownedRank, 1)
  assert.equal(byId.b.ownedRank, 2)
  assert.equal(byId.c.ownedRank, 2) // tied
  assert.equal(byId.d.ownedRank, 4) // skips 3
})

test('positional rank is independent of overall rank', () => {
  const out = withOwnedRanks([
    player('wr1', 'WR', 90),
    player('wr2', 'WR', 70),
    player('rb1', 'RB', 80),
    player('rb2', 'RB', 20),
  ])
  const byId = Object.fromEntries(out.map((a) => [a.assetId, a]))
  assert.equal(byId.wr1.ownedRank, 1)
  assert.equal(byId.rb1.ownedRank, 2)
  assert.equal(byId.wr2.ownedRank, 3)
  // ...but within position, each is 1st or 2nd of two
  assert.equal(byId.wr1.posRank, 1)
  assert.equal(byId.wr2.posRank, 2)
  assert.equal(byId.rb1.posRank, 1)
  assert.equal(byId.rb2.posRank, 2)
  assert.equal(byId.wr1.posRankTotal, 2)
})

test('draft picks are excluded from the field and get null ranks', () => {
  const out = withOwnedRanks([
    player('a', 'RB', 50),
    { assetId: 'pick', position: 'Draft Pick', currentPrice: 999, isPick: true },
  ])
  const byId = Object.fromEntries(out.map((a) => [a.assetId, a]))
  assert.equal(byId.pick.ownedRank, null)
  assert.equal(byId.pick.posRank, null)
  // the $999 pick must not have pushed the real player to rank 2
  assert.equal(byId.a.ownedRank, 1)
  assert.equal(byId.a.ownedRankTotal, 1)
})

test("playerPool 'Free Agent' is a waiver pickup, still rostered, still ranked", () => {
  // Regression: this field records HOW a player was acquired (making him
  // tax-exempt), not whether anyone owns him. Excluding these left real
  // rostered players — e.g. an in-season waiver add — displaying "—".
  const out = withOwnedRanks([
    player('drafted', 'RB', 30),
    player('waiver', 'RB', 95, { playerPool: 'Free Agent' }),
  ])
  const byId = Object.fromEntries(out.map((a) => [a.assetId, a]))
  assert.equal(byId.waiver.ownedRank, 1, 'the pricier waiver add outranks the cheaper drafted player')
  assert.equal(byId.drafted.ownedRank, 2)
  assert.equal(byId.waiver.ownedRankTotal, 2)
})

test('missing price sorts last rather than throwing', () => {
  const out = withOwnedRanks([
    player('a', 'RB', 10),
    player('b', 'WR', undefined),
  ])
  const byId = Object.fromEntries(out.map((a) => [a.assetId, a]))
  assert.equal(byId.a.ownedRank, 1)
  assert.equal(byId.b.ownedRank, 2)
})

test('input array is not mutated', () => {
  const input = [player('a', 'RB', 10)]
  withOwnedRanks(input)
  assert.equal('ownedRank' in input[0], false)
})

test('posRankLabel formats compactly, null for picks', () => {
  assert.equal(posRankLabel({ position: 'RB', posRank: 4 }), 'RB4')
  assert.equal(posRankLabel({ position: 'Draft Pick', posRank: null }), null)
  assert.equal(posRankLabel(null), null)
})
