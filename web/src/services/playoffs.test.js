import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  winValue, computeSeeds, seedingBonus, choosingSeeds, selectableOpponents,
  availableOpponents, nextChooser, buildRoundOne, buildNextRound, roundLabel,
} from './playoffs.js'

// A plausible 12-team finish: eight make it, four miss.
const RECORDS = {
  Jared:      { wins: 11, losses: 3 },
  Bill:       { wins: 10, losses: 4 },
  Ryan:       { wins: 9,  losses: 4, ties: 1 },
  Dugan:      { wins: 9,  losses: 5 },
  Abad:       { wins: 8,  losses: 6 },
  Cantone:    { wins: 7,  losses: 7 },
  Faybik:     { wins: 7,  losses: 7 },
  Foley:      { wins: 6,  losses: 8 },
  Wayne:      { wins: 5,  losses: 9 },
  Jason:      { wins: 4,  losses: 10 },
  'A. Zurek': { wins: 3,  losses: 11 },
  'M. Zurek': { wins: 2,  losses: 12 },
}
// Faybik outscores Cantone on the same record — the tiebreak.
const POINTS = { Cantone: 1500, Faybik: 1600, Foley: 1400, Abad: 1550 }

const seeds = () => computeSeeds(RECORDS, POINTS)

// ── seeding ────────────────────────────────────────────────────

test('a tie counts a half win', () => {
  assert.equal(winValue({ wins: 9, losses: 4, ties: 1 }), 9.5)
  assert.equal(winValue({ wins: 9, losses: 5 }), 9)
})

test('computeSeeds takes the top 8 of 12 and numbers them', () => {
  const s = seeds()
  assert.equal(s.length, 8)
  assert.equal(s[0].teamName, 'Jared')
  assert.equal(s[0].seed, 1)
  assert.equal(s[7].seed, 8)
  assert.ok(!s.some((t) => t.teamName === 'Wayne'))   // 5-9 misses the field
})

test('a 9-4-1 record outranks 9-5', () => {
  const s = seeds()
  assert.ok(s.findIndex((t) => t.teamName === 'Ryan') < s.findIndex((t) => t.teamName === 'Dugan'))
})

test('equal records break on points scored', () => {
  const s = seeds()
  // Cantone and Faybik are both 7-7; Faybik scored more.
  assert.ok(s.findIndex((t) => t.teamName === 'Faybik') < s.findIndex((t) => t.teamName === 'Cantone'))
})

test('computeSeeds handles a missing record without crashing the seeding', () => {
  const s = computeSeeds({ A: { wins: 5, losses: 1 }, B: null, C: { wins: 2, losses: 4 } }, {}, 3)
  assert.deepEqual(s.map((t) => t.teamName), ['A', 'C', 'B'])
  assert.equal(s[2].wins, 0)
})

test('computeSeeds on no records is empty, not a throw', () => {
  assert.deepEqual(computeSeeds({}, {}), [])
  assert.deepEqual(computeSeeds(null, null), [])
})

// ── seeding bonus ──────────────────────────────────────────────

test('seeding bonus is 5 points per extra win, to the better record', () => {
  const b = seedingBonus({ teamName: 'Jared', wins: 11, losses: 3 }, { teamName: 'Abad', wins: 8, losses: 6 })
  assert.deepEqual(b, { teamName: 'Jared', points: 15 })
})

test('seeding bonus goes to the lower seed when the lower seed has more wins', () => {
  // Seeding and record can disagree once tiebreaks are involved — the
  // bonus follows the RECORD, not the seed number.
  const b = seedingBonus({ teamName: 'HighSeed', wins: 7, losses: 7 }, { teamName: 'LowSeed', wins: 9, losses: 5 })
  assert.equal(b.teamName, 'LowSeed')
  assert.equal(b.points, 10)
})

test('level records earn no bonus and report null, not zero', () => {
  assert.equal(seedingBonus({ teamName: 'A', wins: 8, losses: 6 }, { teamName: 'B', wins: 8, losses: 6 }), null)
})

test('a half-win edge is worth half the per-win bonus', () => {
  const b = seedingBonus({ teamName: 'A', wins: 9, losses: 4, ties: 1 }, { teamName: 'B', wins: 9, losses: 5 })
  assert.equal(b.points, 2.5)
})

// ── the opponent draft ─────────────────────────────────────────

test('seeds 1-3 choose; seed 4 takes the leftover', () => {
  assert.deepEqual(choosingSeeds(8), [1, 2, 3])
})

test('the pool picked from is the bottom half', () => {
  assert.deepEqual(selectableOpponents(seeds(), 8).map((s) => s.seed), [5, 6, 7, 8])
})

test('a chosen team leaves the board', () => {
  const s = seeds()
  const picked = s.find((t) => t.seed === 7).teamName
  const left = availableOpponents(s, { 1: picked })
  assert.ok(!left.some((t) => t.teamName === picked))
  assert.equal(left.length, 3)
})

test('picks go in strict seed order', () => {
  const s = seeds()
  assert.equal(nextChooser(s, {}).seed, 1)
  assert.equal(nextChooser(s, { 1: s[7].teamName }).seed, 2)
  // Seed 2 picking out of turn does not make it seed 3's turn.
  assert.equal(nextChooser(s, { 2: s[7].teamName }).seed, 1)
})

test('nextChooser is null once every pick is in', () => {
  const s = seeds()
  const sel = { 1: s[7].teamName, 2: s[6].teamName, 3: s[5].teamName }
  assert.equal(nextChooser(s, sel), null)
})

test('buildRoundOne shows unmade picks as open matchups rather than hiding them', () => {
  const s = seeds()
  const games = buildRoundOne(s, { 1: s[7].teamName })
  assert.equal(games.length, 4)
  assert.equal(games[0].low.teamName, s[7].teamName)
  assert.equal(games[0].complete, true)
  assert.equal(games[1].low, null)          // seed 2 hasn't picked
  assert.equal(games[1].complete, false)
})

test('seed 4 is only assigned once exactly one opponent remains', () => {
  const s = seeds()
  const partial = buildRoundOne(s, { 1: s[7].teamName, 2: s[6].teamName })
  assert.equal(partial[3].low, null)        // two still unclaimed

  const full = buildRoundOne(s, { 1: s[7].teamName, 2: s[6].teamName, 3: s[5].teamName })
  assert.equal(full[3].low.teamName, s[4].teamName)
  assert.ok(full.every((g) => g.complete))
})

test('the top seed may pick anyone in the pool, not just the bottom seed', () => {
  const s = seeds()
  const fifth = s.find((t) => t.seed === 5).teamName
  const games = buildRoundOne(s, { 1: fifth, 2: s[7].teamName, 3: s[6].teamName })
  assert.equal(games[0].low.teamName, fifth)
  assert.equal(games[3].low.teamName, s[5].teamName)   // seed 4 gets seed 6
})

test('round one carries the seeding bonus on each matchup', () => {
  const s = seeds()
  const games = buildRoundOne(s, { 1: s[7].teamName, 2: s[6].teamName, 3: s[5].teamName })
  const top = games[0]
  assert.equal(top.bonus.teamName, top.high.teamName)
  assert.equal(top.bonus.points, (winValue(top.high) - winValue(top.low)) * 5)
})

// ── advancing ──────────────────────────────────────────────────

test('the next round re-seeds — best surviving seed plays worst', () => {
  const s = seeds()
  const winners = [s[0].teamName, s[3].teamName, s[5].teamName, s[7].teamName] // seeds 1,4,6,8
  const games = buildNextRound(s, winners, 4)
  assert.equal(games.length, 2)
  assert.deepEqual([games[0].high.seed, games[0].low.seed], [1, 8])
  assert.deepEqual([games[1].high.seed, games[1].low.seed], [4, 6])
})

test('a half-finished round produces no next round', () => {
  const s = seeds()
  assert.deepEqual(buildNextRound(s, [s[0].teamName, s[3].teamName, s[5].teamName], 4), [])
  assert.deepEqual(buildNextRound(s, [], 4), [])
})

test('nulls for undecided games are ignored, not treated as teams', () => {
  const s = seeds()
  // Two of four decided. Without expectedGames this looks exactly like a
  // finished two-game round and would invent a semifinal.
  assert.deepEqual(buildNextRound(s, [s[0].teamName, null, s[5].teamName, null], 4), [])
  // All four in.
  const full = buildNextRound(s, [s[0].teamName, s[3].teamName, s[5].teamName, s[7].teamName], 4)
  assert.equal(full.length, 2)
})

test('an unrecognised winner name is dropped rather than seeding a ghost', () => {
  const s = seeds()
  assert.deepEqual(buildNextRound(s, [s[0].teamName, 'Nobody'], 2), [])
})

test('round labels read as the league says them', () => {
  assert.equal(roundLabel(8), 'Quarterfinals')
  assert.equal(roundLabel(4), 'Semifinals')
  assert.equal(roundLabel(2), 'Championship')
})
