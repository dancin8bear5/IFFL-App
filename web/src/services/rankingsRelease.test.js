import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  WAVES, MAX_LEVEL, HIDDEN, normalizeLevel, isWaveOut, releasedTeams,
  isLadderOut, isAnythingOut, waveStates,
} from './rankingsRelease.js'
// A fixture, not the real content. The wave logic is about ranks and
// nothing else, so coupling these tests to a particular season's prose
// only meant the suite broke when that prose was swapped out.
const rankings = Array.from({ length: 12 }, (_, i) => ({
  rank: 12 - i,
  team: `Team${12 - i}`,
  verdict: `verdict ${12 - i}`,
}))

const ranksAt = (lvl) => releasedTeams(lvl, rankings).map((t) => t.rank)

test('nothing is public at level 0', () => {
  assert.equal(isAnythingOut(0), false)
  assert.deepEqual(ranksAt(0), [])
  assert.equal(isWaveOut(0, 'intro'), false)
})

test('each wave publishes exactly its own four, and holds the rest', () => {
  assert.deepEqual(ranksAt(1), [])                        // intro only, no teams
  assert.deepEqual(ranksAt(2), [12, 11, 10, 9])
  assert.deepEqual(ranksAt(3), [12, 11, 10, 9, 8, 7, 6, 5])
  assert.deepEqual(ranksAt(4), [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1])
})

test('THE ONE THAT MATTERS: no rank ever leaks a wave early', () => {
  // Walk every level and assert nothing above the published floor appears.
  const floor = { 0: null, 1: null, 2: 9, 3: 5, 4: 1 }
  for (const lvl of [0, 1, 2, 3, 4]) {
    const out = ranksAt(lvl)
    if (floor[lvl] === null) { assert.deepEqual(out, []); continue }
    assert.ok(Math.min(...out) === floor[lvl], `level ${lvl} floor`)
    assert.equal(out.length, new Set(out).size, 'no team published twice')
  }
})

test('the ladder waits for the last wave — it gives away all twelve', () => {
  assert.equal(isLadderOut(0), false)
  assert.equal(isLadderOut(2), false)
  assert.equal(isLadderOut(3), false)
  assert.equal(isLadderOut(MAX_LEVEL), true)
})

test('the introduction rides with level 1 and stays out after', () => {
  for (const lvl of [1, 2, 3, 4]) assert.equal(isWaveOut(lvl, 'intro'), true)
})

test('a bad level reads as hidden, never as fully published', () => {
  for (const bad of [undefined, null, '', 'lots', NaN, -1, -99, {}, []]) {
    assert.equal(normalizeLevel(bad), HIDDEN, String(bad))
    assert.deepEqual(ranksAt(bad), [])
  }
  // ...and an over-large number clamps rather than throwing
  assert.equal(normalizeLevel(99), MAX_LEVEL)
  assert.equal(normalizeLevel('3'), 3)
  assert.equal(normalizeLevel(2.7), 2)
})

test('an unknown wave key is never out', () => {
  assert.equal(isWaveOut(4, 'nope'), false)
})

test('waveStates reports each wave as out or pending', () => {
  assert.deepEqual(waveStates(0).map((w) => w.out), [false, false, false, false])
  assert.deepEqual(waveStates(2).map((w) => w.out), [true, true, false, false])
  assert.deepEqual(waveStates(4).map((w) => w.out), [true, true, true, true])
  assert.equal(waveStates(1)[0].label, 'Introduction')
})

test('the waves between them cover all twelve ranks exactly once', () => {
  const covered = []
  for (const w of WAVES) {
    if (!w.from) continue
    for (let r = w.to; r <= w.from; r++) covered.push(r)
  }
  assert.deepEqual(covered.sort((a, b) => a - b), [1,2,3,4,5,6,7,8,9,10,11,12])
})

test('missing rankings data degrades to empty rather than throwing', () => {
  assert.deepEqual(releasedTeams(4, null), [])
  assert.deepEqual(releasedTeams(4, []), [])
})
