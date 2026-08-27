import test from 'node:test'
import assert from 'node:assert/strict'
import {
  optimalLineup, weekRegret, regretLeaderboard, rosterDNA,
  isStartingSlot, SLOT_ELIGIBILITY,
} from './lineupOptimizer.js'

const p = (position, points, player = `${position}${points}`) => ({ position, points, player })

test('optimalLineup fills each slot with the best eligible player', () => {
  const { total, picks } = optimalLineup(['QB', 'RB', 'WR'], [
    p('QB', 30), p('QB', 10), p('RB', 20), p('WR', 15), p('WR', 25),
  ])
  assert.equal(total, 75) // 30 + 20 + 25
  assert.equal(picks.length, 3)
  assert.equal(picks.find((x) => x.slot === 'WR').points, 25)
})

test('optimalLineup respects FLEX and OP eligibility', () => {
  // OP can take a QB; FLEX cannot.
  const flexOnly = optimalLineup(['FLEX'], [p('QB', 99), p('RB', 10)])
  assert.equal(flexOnly.total, 10)
  const op = optimalLineup(['OP'], [p('QB', 99), p('RB', 10)])
  assert.equal(op.total, 99)
  // D/ST is never eligible for a flex spot
  assert.equal(optimalLineup(['FLEX'], [p('D/ST', 50)]).total, 0)
})

test('optimalLineup never reuses a player across slots', () => {
  const { total, picks } = optimalLineup(['RB', 'FLEX', 'OP'], [p('RB', 40)])
  assert.equal(total, 40)
  assert.equal(picks.length, 1)
})

test('optimalLineup ignores bench and non-starting slots in the requirement list', () => {
  assert.equal(isStartingSlot('BE'), false)
  assert.equal(isStartingSlot('IR'), false)
  assert.equal(isStartingSlot('FLEX'), true)
  const { total } = optimalLineup(['QB', 'BE', 'IR'], [p('QB', 20), p('RB', 99)])
  assert.equal(total, 20)
})

test('optimalLineup handles a short bench and missing positions', () => {
  const { total } = optimalLineup(['QB', 'RB', 'RB', 'D/ST'], [p('QB', 12)])
  assert.equal(total, 12) // unfillable slots simply score nothing
  assert.equal(optimalLineup([], [p('QB', 50)]).total, 0)
  assert.equal(optimalLineup(['QB'], []).total, 0)
})

// The greedy is only valid because the eligibility sets are laminar. Prove it
// on randomized rosters against an exhaustive search.
test('optimalLineup matches brute force on random rosters', () => {
  const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'D/ST', 'K']
  const SLOTS = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'OP', 'RB/WR', 'D/ST', 'K']

  // Deterministic PRNG so a failure is reproducible.
  let seed = 12345
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)]

  const brute = (slots, players) => {
    const starting = slots.filter(isStartingSlot)
    let best = 0
    const walk = (i, used, sum) => {
      if (i === starting.length) { best = Math.max(best, sum); return }
      const eligible = SLOT_ELIGIBILITY[starting[i]]
      let any = false
      for (let j = 0; j < players.length; j++) {
        if (used.has(j) || !eligible.includes(players[j].position)) continue
        any = true
        used.add(j)
        walk(i + 1, used, sum + players[j].points)
        used.delete(j)
      }
      if (!any) walk(i + 1, used, sum) // slot goes unfilled
    }
    walk(0, new Set(), 0)
    return Math.round(best * 100) / 100
  }

  for (let trial = 0; trial < 300; trial++) {
    const slotCount = 2 + Math.floor(rnd() * 4) // keep brute force tractable
    const slots = Array.from({ length: slotCount }, () => pick(SLOTS))
    const playerCount = 2 + Math.floor(rnd() * 5)
    const players = Array.from({ length: playerCount }, () =>
      p(pick(POSITIONS), Math.round(rnd() * 400) / 10))
    assert.equal(
      optimalLineup(slots, players).total,
      brute(slots, players),
      `mismatch on trial ${trial}: slots=${JSON.stringify(slots)} players=${JSON.stringify(players)}`,
    )
  }
})

test('weekRegret compares optimal against what was actually started', () => {
  const rows = [
    { player: 'A', position: 'QB', slot: 'QB', status: 'Starter', points: 10 },
    { player: 'B', position: 'RB', slot: 'RB', status: 'Starter', points: 5 },
    { player: 'C', position: 'RB', slot: 'BE', status: 'Bench', points: 25 },
  ]
  const r = weekRegret(rows)
  assert.equal(r.started, 15)
  assert.equal(r.optimal, 35) // QB 10 + the benched RB 25
  assert.equal(r.regret, 20)
  assert.equal(r.benchPoints, 25)
})

test('weekRegret never credits an IR player', () => {
  const rows = [
    { player: 'A', position: 'QB', slot: 'QB', status: 'Starter', points: 10 },
    { player: 'B', position: 'QB', slot: 'IR', status: 'IR', points: 99 },
  ]
  const r = weekRegret(rows)
  assert.equal(r.optimal, 10)
  assert.equal(r.regret, 0)
})

test('weekRegret returns null when a week has no starters', () => {
  assert.equal(weekRegret([]), null)
  assert.equal(weekRegret(null), null)
  assert.equal(weekRegret([{ position: 'RB', slot: 'BE', status: 'Bench', points: 10 }]), null)
})

test('weekRegret is never negative for a legal lineup', () => {
  const rows = [
    { position: 'QB', slot: 'QB', status: 'Starter', points: 30 },
    { position: 'RB', slot: 'RB', status: 'Starter', points: 20 },
    { position: 'WR', slot: 'BE', status: 'Bench', points: 1 },
  ]
  assert.equal(weekRegret(rows).regret, 0)
})

test('regretLeaderboard totals per team, worst first', () => {
  const rows = [
    { season: 2024, week: 1, team: 'Ryan', regret: 30, flipped: true },
    { season: 2024, week: 2, team: 'Ryan', regret: 10, flipped: false },
    { season: 2024, week: 1, team: 'Bill', regret: 5, flipped: false },
  ]
  const board = regretLeaderboard(rows)
  assert.equal(board[0].team, 'Ryan')
  assert.equal(board[0].regret, 40)
  assert.equal(board[0].weeks, 2)
  assert.equal(board[0].perWeek, 20)
  assert.equal(board[0].flippedLosses, 1)
  assert.equal(regretLeaderboard(rows, (t) => t !== 'Ryan').length, 1)
})

// The team with the most total regret is NOT necessarily the one who lost the
// most winnable games — in the real 2018+ data those are two different
// managers. The Trophy Room reports both, so they must be sorted separately.
test('regret leader and flipped-loss leader are independent rankings', () => {
  const rows = [
    // Big regret in blowouts nobody could have won
    { team: 'Ryan', regret: 90, flipped: false },
    { team: 'Ryan', regret: 90, flipped: true },
    // Small regret, but repeatedly enough to flip close losses
    { team: 'Dugan', regret: 6, flipped: true },
    { team: 'Dugan', regret: 6, flipped: true },
    { team: 'Dugan', regret: 6, flipped: true },
  ]
  const board = regretLeaderboard(rows)
  assert.equal(board[0].team, 'Ryan') // most total regret
  const byFlips = [...board].sort((a, b) => b.flippedLosses - a.flippedLosses)
  assert.equal(byFlips[0].team, 'Dugan') // most winnable games lost
  assert.notEqual(board[0].team, byFlips[0].team)
})

test('rosterDNA turns starter points into shares that total 1', () => {
  const dna = rosterDNA([
    { team: 'Jared', total: 100, byPosition: { QB: 20, RB: 25, WR: 40, TE: 10, 'D/ST': 3, K: 0, LB: 2 } },
    { team: 'Ghost', total: 0, byPosition: {} },
  ])
  assert.equal(dna.length, 1) // zero-total team dropped
  assert.equal(dna[0].shares.WR, 0.4)
  assert.equal(dna[0].shares.Other, 0.02)
  const sum = ['QB', 'RB', 'WR', 'TE', 'D/ST', 'K', 'Other'].reduce((a, k) => a + dna[0].shares[k], 0)
  assert.ok(Math.abs(sum - 1) < 1e-9)
})

// Shares over 1 would push a stacked bar past the end of its own track.
test('rosterDNA never yields shares above 1, even if the parts exceed the total', () => {
  const dna = rosterDNA([
    { team: 'Bad', total: 100, byPosition: { QB: 60, RB: 60, WR: 30 } }, // parts = 150
  ])
  const sum = ['QB', 'RB', 'WR', 'TE', 'D/ST', 'K', 'Other'].reduce((a, k) => a + dna[0].shares[k], 0)
  assert.ok(Math.abs(sum - 1) < 1e-9, `shares summed to ${sum}`)
  for (const k of ['QB', 'RB', 'WR', 'Other']) assert.ok(dna[0].shares[k] <= 1)
  assert.equal(dna[0].shares.Other, 0)
})
