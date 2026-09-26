// Unit tests for the marketEngine port — run with `npm test`.
// Cases mirror the Swift algorithm's behavior so the port can be trusted.
import test from 'node:test'
import assert from 'node:assert/strict'
import { findMatches } from './marketEngine.js'

const asset = (assetId, teamName, currentPrice) => ({
  id: assetId,
  assetId,
  teamName,
  currentPrice,
})

const fmk = (teamName, assetId, signal) => ({ teamName, assetId, signal })

test('mutual fuck interest within 10% price parity produces a match', () => {
  const assets = [asset('J-Kelce', 'Jared', 50), asset('R-Adams', 'Ryan', 52)]
  const signals = [fmk('Jared', 'R-Adams', 'fuck'), fmk('Ryan', 'J-Kelce', 'fuck')]

  const matches = findMatches(signals, assets)
  assert.equal(matches.length, 1)
  assert.equal(matches[0].matchScore, 2) // fuck(1) + fuck(1)
  assert.equal(matches[0].aWants.length, 1)
  assert.equal(matches[0].bWants.length, 1)
})

test('one-sided interest produces no match', () => {
  const assets = [asset('J-Kelce', 'Jared', 50), asset('R-Adams', 'Ryan', 52)]
  const signals = [fmk('Jared', 'R-Adams', 'marry')] // Ryan wants nothing back

  assert.equal(findMatches(signals, assets).length, 0)
})

test('price gap beyond 10% blocks the pair', () => {
  const assets = [asset('J-Kelce', 'Jared', 50), asset('R-Adams', 'Ryan', 80)]
  const signals = [fmk('Jared', 'R-Adams', 'marry'), fmk('Ryan', 'J-Kelce', 'marry')]

  // |50-80|/80 = 0.375 > 0.10 → no valid pair → no match
  assert.equal(findMatches(signals, assets).length, 0)
})

test('marry+marry scores 4; owner kill bonuses raise it to 6', () => {
  const assets = [asset('J-Kelce', 'Jared', 50), asset('R-Adams', 'Ryan', 50)]
  const signals = [
    fmk('Jared', 'R-Adams', 'marry'),
    fmk('Ryan', 'J-Kelce', 'marry'),
    // Owners kill their own assets — both dump bonuses apply
    fmk('Ryan', 'R-Adams', 'kill'),
    fmk('Jared', 'J-Kelce', 'kill'),
  ]

  const matches = findMatches(signals, assets)
  assert.equal(matches.length, 1)
  assert.equal(matches[0].matchScore, 6) // 2+2 + 1+1
})

test('kill signals never count as wants', () => {
  const assets = [asset('J-Kelce', 'Jared', 50), asset('R-Adams', 'Ryan', 50)]
  const signals = [fmk('Jared', 'R-Adams', 'kill'), fmk('Ryan', 'J-Kelce', 'marry')]

  assert.equal(findMatches(signals, assets).length, 0)
})

test('priorityTeam matches sort first regardless of score', () => {
  const assets = [
    asset('J-A', 'Jared', 50),
    asset('R-B', 'Ryan', 50),
    asset('B-C', 'Bill', 30),
    asset('W-D', 'Wayne', 30),
  ]
  const signals = [
    // Jared↔Ryan: fuck+fuck = 2
    fmk('Jared', 'R-B', 'fuck'),
    fmk('Ryan', 'J-A', 'fuck'),
    // Bill↔Wayne: marry+marry = 4 (higher score)
    fmk('Bill', 'W-D', 'marry'),
    fmk('Wayne', 'B-C', 'marry'),
  ]

  const byScore = findMatches(signals, assets)
  assert.equal(byScore[0].matchScore, 4) // Bill↔Wayne first by default

  const prioritized = findMatches(signals, assets, 'Jared')
  assert.ok(prioritized[0].teamA === 'Jared' || prioritized[0].teamB === 'Jared')
})

test('zero-price assets clamp to $1 and still match each other', () => {
  const assets = [asset('J-Pick', 'Jared', 0), asset('R-Pick', 'Ryan', 0)]
  const signals = [fmk('Jared', 'R-Pick', 'fuck'), fmk('Ryan', 'J-Pick', 'fuck')]

  assert.equal(findMatches(signals, assets).length, 1)
})
