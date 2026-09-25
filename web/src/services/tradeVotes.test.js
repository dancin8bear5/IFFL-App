import test from 'node:test'
import assert from 'node:assert/strict'
import {
  tradeSides, isParticipant, canVote, myVote, tallyVotes, unjudgedCount, boomRecord,
} from './tradeVotes.js'

const trade = { id: 't1', proposingTeamName: 'Jared', receivingTeamName: 'Jason' }
const other = { id: 't2', proposingTeamName: 'Bill', receivingTeamName: 'Dugan' }
const v = (tradeId, uid, votedFor) => ({ tradeId, uid, votedFor })

test('a trade has exactly its two sides, proposer first', () => {
  assert.deepEqual(tradeSides(trade), ['Jared', 'Jason'])
  assert.ok(isParticipant(trade, 'Jason'))
  assert.ok(!isParticipant(trade, 'Bill'))
})

test('participants cannot vote on their own trade', () => {
  assert.ok(!canVote(trade, 'Jared'))
  assert.ok(!canVote(trade, 'Jason'))
  assert.ok(canVote(trade, 'Bill'))
})

test('a member with no team assigned cannot vote', () => {
  // There would be no way to tell whether they were in the trade.
  assert.ok(!canVote(trade, null))
  assert.ok(!canVote(trade, ''))
  assert.ok(!canVote(null, 'Bill'))
})

test('tally splits the vote and names the leader', () => {
  const votes = [
    v('t1', 'u1', 'Jared'), v('t1', 'u2', 'Jared'), v('t1', 'u3', 'Jason'),
    v('t2', 'u1', 'Bill'), // different trade, must not leak in
  ]
  const { rows, total, leader } = tallyVotes(votes, trade)
  assert.equal(total, 3)
  assert.equal(leader, 'Jared')
  assert.deepEqual(rows.map((r) => [r.team, r.count]), [['Jared', 2], ['Jason', 1]])
  assert.ok(Math.abs(rows[0].share - 2 / 3) < 1e-9)
})

test('a dead tie has no leader', () => {
  const votes = [v('t1', 'u1', 'Jared'), v('t1', 'u2', 'Jason')]
  const { leader, total } = tallyVotes(votes, trade)
  assert.equal(total, 2)
  assert.equal(leader, null, 'calling a 1-1 split for either side would be a lie')
})

test('no votes yields a zero total, not a phantom 50/50', () => {
  const { rows, total, leader } = tallyVotes([], trade)
  assert.equal(total, 0)
  assert.equal(leader, null)
  assert.deepEqual(rows.map((r) => r.share), [0, 0])
})

test('a vote for a team not in the trade is dropped, not counted', () => {
  const votes = [v('t1', 'u1', 'Jared'), v('t1', 'u2', 'Wayne')]
  const { rows, total } = tallyVotes(votes, trade)
  assert.equal(total, 1, 'Wayne was never in this trade')
  assert.deepEqual(rows.map((r) => r.count), [1, 0])
})

test('myVote finds only this user on this trade', () => {
  const votes = [v('t1', 'u1', 'Jared'), v('t2', 'u1', 'Bill'), v('t1', 'u2', 'Jason')]
  assert.equal(myVote(votes, 't1', 'u1').votedFor, 'Jared')
  assert.equal(myVote(votes, 't2', 'u1').votedFor, 'Bill')
  assert.equal(myVote(votes, 't1', 'u9'), null)
  assert.equal(myVote(votes, 't1', null), null)
})

test('unjudged skips your own trades and the ones you already called', () => {
  const trades = [trade, other]
  // Bill is in `other`, so only `trade` is his to judge.
  assert.equal(unjudgedCount(trades, [], 'u1', 'Bill'), 1)
  assert.equal(unjudgedCount(trades, [v('t1', 'u1', 'Jared')], 'u1', 'Bill'), 0)
  // Wayne is in neither, so both are his.
  assert.equal(unjudgedCount(trades, [], 'u2', 'Wayne'), 2)
})

test('boom record credits the winner and debits the loser of each verdict', () => {
  const trades = [trade, other]
  const votes = [
    v('t1', 'u1', 'Jared'), v('t1', 'u2', 'Jared'),   // Jared boomed
    v('t2', 'u1', 'Dugan'), v('t2', 'u2', 'Dugan'),   // Dugan boomed
  ]
  const rec = boomRecord(trades, votes)
  const by = (t) => rec.find((r) => r.team === t)
  assert.deepEqual([by('Jared').booms, by('Jared').dooms], [1, 0])
  assert.deepEqual([by('Jason').booms, by('Jason').dooms], [0, 1])
  assert.deepEqual([by('Dugan').booms, by('Dugan').dooms], [1, 0])
  assert.equal(by('Jared').boomPct, 1)
  assert.equal(by('Jason').boomPct, 0)
})

test('unjudged and tied trades do not enter the boom record', () => {
  const tied = [v('t1', 'u1', 'Jared'), v('t1', 'u2', 'Jason')]
  assert.deepEqual(boomRecord([trade], tied), [], 'a tie decides nothing')
  assert.deepEqual(boomRecord([trade], []), [], 'an unjudged trade decides nothing')
})
