import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DROPS, DROP_KEYS, normalizeReleased, isDropOut, dropStates,
  releasedTeams, releasedRanks, isAnythingOut, ladderRows, releaseSummary,
} from './rankingsRelease.js'

// A fixture, not the payload. The gating is about ranks and drop keys; tying
// these tests to a season's prose only means they break when it is replaced.
const drops = {
  '12-9': { teams: [12, 11, 10, 9].map((rank) => ({ rank, team: `T${rank}` })) },
  '8-5': { teams: [8, 7, 6, 5].map((rank) => ({ rank, team: `T${rank}` })) },
  '4-1': { teams: [4, 3, 2, 1].map((rank) => ({ rank, team: `T${rank}` })) },
}
const ranksAt = (rel) => releasedTeams(rel, drops).map((t) => t.rank)

test('nothing is public until a drop is released', () => {
  assert.deepEqual(ranksAt([]), [])
  assert.equal(isAnythingOut([]), false)
  assert.equal(releasedRanks([]).size, 0)
})

test('each drop publishes exactly its own four', () => {
  assert.deepEqual(ranksAt(['12-9']), [12, 11, 10, 9])
  assert.deepEqual(ranksAt(['12-9', '8-5']), [12, 11, 10, 9, 8, 7, 6, 5])
  assert.deepEqual(ranksAt(DROP_KEYS), [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1])
})

test('THE ONE THAT MATTERS: no rank leaks a drop early', () => {
  const floor = { '12-9': 9, '8-5': 5, '4-1': 1 }
  let acc = ['intro']
  for (const key of DROP_KEYS.filter((k) => k !== 'intro')) {
    acc = [...acc, key]
    const out = ranksAt(acc)
    assert.equal(Math.min(...out), floor[key], `after ${key}`)
    assert.equal(out.length, new Set(out).size, 'no team twice')
  }
})

test('a malformed release list fails CLOSED, never open', () => {
  for (const bad of [undefined, null, '', 'all', 0, 4, {}, NaN, true]) {
    assert.deepEqual(normalizeReleased(bad), [], String(bad))
    assert.deepEqual(ranksAt(bad), [])
    assert.equal(isAnythingOut(bad), false)
  }
})

test('unknown keys are discarded rather than trusted', () => {
  assert.deepEqual(normalizeReleased(['nope', '12-9', 'all']), ['12-9'])
  assert.deepEqual(ranksAt(['nope']), [])
  assert.equal(isDropOut(['12-9'], 'nope'), false)
})

test('order and duplicates in the stored list do not matter', () => {
  assert.deepEqual(normalizeReleased(['4-1', '12-9']), ['12-9', '4-1'])
  assert.deepEqual(normalizeReleased(['12-9', '12-9']), ['12-9'])
  // ...but a gap stays a gap — releasing 4-1 alone shows only 4-1
  assert.deepEqual(ranksAt(['4-1']), [4, 3, 2, 1])
})

test('teams come back 12 → 1, by rank', () => {
  const out = releasedTeams(DROP_KEYS, drops).map((t) => t.rank)
  assert.deepEqual(out, [...out].sort((a, b) => b - a))
})

test('sorting is on rank, so an out-of-order score cannot reorder anyone', () => {
  // Cantone's real shape: rank 5 with a score below the teams at 6 and 7.
  const d = { '8-5': { teams: [
    { rank: 5, score: 2.845 }, { rank: 6, score: 2.985 },
    { rank: 7, score: 2.945 }, { rank: 8, score: 2.775 },
  ] } }
  assert.deepEqual(releasedTeams(['8-5'], d).map((t) => t.rank), [8, 7, 6, 5])
})

test('the ladder names only released ranks', () => {
  assert.deepEqual([...releasedRanks(['12-9'])].sort((a, b) => a - b), [9, 10, 11, 12])
  assert.equal(releasedRanks(DROP_KEYS).size, 12)
  assert.equal(releasedRanks(['12-9']).has(8), false)
})

test('dropStates reports each drop as out or pending, in order', () => {
  assert.deepEqual(dropStates([]).map((d) => d.out), [false, false, false, false])
  assert.deepEqual(dropStates(['12-9']).map((d) => d.out), [false, true, false, false])
  assert.deepEqual(dropStates(DROP_KEYS).map((d) => d.out), [true, true, true, true])
  assert.equal(dropStates([])[0].label, 'Introduction')
})

test('the rank drops between them cover all twelve ranks exactly once', () => {
  const covered = DROPS.filter((d) => d.from).flatMap((d) => {
    const r = []
    for (let i = d.to; i <= d.from; i++) r.push(i)
    return r
  })
  assert.deepEqual(covered.sort((a, b) => a - b), [1,2,3,4,5,6,7,8,9,10,11,12])
})

test('missing drop data degrades to empty rather than throwing', () => {
  assert.deepEqual(releasedTeams(DROP_KEYS, null), [])
  assert.deepEqual(releasedTeams(['12-9'], {}), [])
  assert.deepEqual(releasedTeams(['12-9'], { '12-9': {} }), [])
})

test('the introduction is its own gate and publishes no placements', () => {
  assert.equal(isDropOut(['intro'], 'intro'), true)
  assert.deepEqual(ranksAt(['intro']), [])
  assert.equal(releasedRanks(['intro']).size, 0)
})

test('gates are INDEPENDENT — any one opens without the others', () => {
  assert.deepEqual(ranksAt(['8-5']), [8, 7, 6, 5])
  assert.deepEqual(ranksAt(['intro', '4-1']), [4, 3, 2, 1])
  assert.equal(isDropOut(['4-1'], 'intro'), false)
  assert.equal(isDropOut(['intro'], '12-9'), false)
})

test('the ladder is DERIVED, so an unreleased placement has nowhere to leak from', () => {
  const named = (rel) => ladderRows(rel, drops).filter((r) => r.out).map((r) => r.rank)
  assert.deepEqual(named([]), [])
  assert.deepEqual(named(['intro']), [])
  assert.deepEqual(named(['12-9']), [9, 10, 11, 12])
  assert.deepEqual(named(DROP_KEYS), [1,2,3,4,5,6,7,8,9,10,11,12])
  // a locked row carries no team and no owner at all
  const locked = ladderRows(['12-9'], drops).find((r) => r.rank === 1)
  assert.equal(locked.out, false)
  assert.equal(locked.team, undefined)
  assert.equal(locked.owner, undefined)
})

test('the ladder always has twelve rows, released or not', () => {
  assert.equal(ladderRows([], drops).length, 12)
  assert.deepEqual(ladderRows([], drops).map((r) => r.rank), [1,2,3,4,5,6,7,8,9,10,11,12])
})

test('the banner summary names what is ACTUALLY public', () => {
  assert.equal(releaseSummary([]), null, 'nothing out → no banner at all')
  assert.equal(releaseSummary('junk'), null)
  assert.equal(releaseSummary(['intro']), 'The introduction is live')
  assert.equal(releaseSummary(['intro', '12-9']), '12–9 is live')
  assert.equal(releaseSummary(['12-9', '8-5']), '12–9 and 8–5 are live')
  assert.equal(releaseSummary(['12-9', '8-5', '4-1']), 'All twelve, ranked')
  assert.equal(releaseSummary(DROP_KEYS), 'All twelve, ranked')
})

test('the summary never promises ranks that are not out', () => {
  // Introduction alone must not read as though the rankings have dropped.
  assert.ok(!/\d/.test(releaseSummary(['intro'])))
  assert.ok(!releaseSummary(['intro']).includes('twelve'))
})
