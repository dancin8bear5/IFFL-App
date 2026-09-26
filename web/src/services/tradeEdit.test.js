import test from 'node:test'
import assert from 'node:assert/strict'
import {
  planAssetAddition, planAssetRemoval, listedAssets,
  PROPOSER_SIDE, RECEIVER_SIDE,
} from './tradeEdit.js'

const trade = () => ({
  id: 't1',
  proposingTeamName: 'Jared',
  receivingTeamName: 'M. Zurek',
  assetsFromProposer: [{ assetId: 'p_willis', assetType: 'player', displayName: 'Malik Willis' }],
  assetsFromReceiver: [{ assetId: 'p_kyren', assetType: 'player', displayName: 'Kyren Williams' }],
})

const pick = (currentTeam) => ({
  assetId: 'pick_2027_2', assetType: 'draftPick',
  displayName: '2027 Round 2', currentTeam,
})

test('lists every recorded asset with the side it sits on', () => {
  const all = listedAssets(trade())
  assert.equal(all.length, 2)
  assert.equal(all.find((a) => a.assetId === 'p_willis').side, PROPOSER_SIDE)
  assert.equal(all.find((a) => a.assetId === 'p_kyren').side, RECEIVER_SIDE)
})

test('a missed pick joins the side of whoever still holds it', () => {
  // The pick never moved, so its current owner is the team that owed it.
  const plan = planAssetAddition(trade(), pick('Jared'))
  assert.equal(plan.ok, true)
  assert.equal(plan.side, PROPOSER_SIDE, 'Jared is the proposer, so it is his to send')
  assert.equal(plan.fromTeam, 'Jared')
  assert.equal(plan.toTeam, 'M. Zurek')
  assert.deepEqual(plan.ref, {
    assetId: 'pick_2027_2', assetType: 'draftPick', displayName: '2027 Round 2',
  })
})

test('direction flips when the other side holds it — no caller input needed', () => {
  const plan = planAssetAddition(trade(), pick('M. Zurek'))
  assert.equal(plan.side, RECEIVER_SIDE)
  assert.equal(plan.fromTeam, 'M. Zurek')
  assert.equal(plan.toTeam, 'Jared')
})

test('an asset held by a team not in the trade is refused', () => {
  const plan = planAssetAddition(trade(), pick('Bill'))
  assert.equal(plan.ok, false)
  assert.match(plan.error, /Bill, who is not in this trade/)
})

test('adding the same asset twice is refused, not duplicated', () => {
  const plan = planAssetAddition(trade(), {
    assetId: 'p_willis', assetType: 'player', displayName: 'Malik Willis', currentTeam: 'M. Zurek',
  })
  assert.equal(plan.ok, false)
  assert.match(plan.error, /already on this trade/)
})

test('missing trade, missing asset and a one-sided trade all refuse cleanly', () => {
  assert.equal(planAssetAddition(null, pick('Jared')).ok, false)
  assert.equal(planAssetAddition(trade(), null).ok, false)
  assert.equal(planAssetAddition(trade(), { displayName: 'x' }).ok, false)
  const oneSided = { ...trade(), receivingTeamName: null }
  assert.match(planAssetAddition(oneSided, pick('Jared')).error, /two teams/)
})

test('removal sends the asset back to the side that sent it', () => {
  const plan = planAssetRemoval(trade(), 'p_willis')
  assert.equal(plan.ok, true)
  assert.equal(plan.side, PROPOSER_SIDE)
  assert.equal(plan.backTo, 'Jared', 'Willis was Jared\'s to send, so he goes back to Jared')
  assert.equal(plan.from, 'M. Zurek')
})

test('removal reads direction off the trade, both ways', () => {
  const plan = planAssetRemoval(trade(), 'p_kyren')
  assert.equal(plan.backTo, 'M. Zurek')
  assert.equal(plan.from, 'Jared')
})

test('removing something not on the trade is refused', () => {
  assert.equal(planAssetRemoval(trade(), 'nope').ok, false)
  assert.equal(planAssetRemoval(null, 'p_willis').ok, false)
})

test('add then remove returns the asset to where it started', () => {
  const t = trade()
  const add = planAssetAddition(t, pick('Jared'))
  // Apply the addition to a copy of the trade, as the service would.
  const after = { ...t, [add.side]: [...t[add.side], add.ref] }
  const undo = planAssetRemoval(after, 'pick_2027_2')
  assert.equal(undo.backTo, add.fromTeam, 'undo must land it back with the original owner')
  assert.equal(undo.from, add.toTeam)
})
