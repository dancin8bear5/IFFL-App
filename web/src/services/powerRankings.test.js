import test from 'node:test'
import assert from 'node:assert/strict'
import { computePowerRankings, leagueCapSummary } from './powerRankings.js'

const p = (teamName, name, currentPrice, extra = {}) => ({
  teamName, name, currentPrice, position: 'RB', isPick: false, playerPool: 'Keeper',
  purchaseYear: 2020, salaryStatus: 'rostered', ...extra,
})
const pick = (teamName, name) => ({ teamName, name, currentPrice: 0, isPick: true, position: 'Draft Pick' })
const TEAMS = [{ name: 'A', owner: 'Owner A' }, { name: 'B', owner: 'Owner B' }]
const SEASON = 2026

test('ranks teams by total roster value, strongest first', () => {
  const rows = computePowerRankings(
    [p('A', 'a1', 50), p('A', 'a2', 30), p('B', 'b1', 100)],
    TEAMS, SEASON,
  )
  assert.equal(rows[0].teamName, 'B')
  assert.equal(rows[0].rank, 1)
  assert.equal(rows[0].rosterValue, 100)
  assert.equal(rows[1].teamName, 'A')
  assert.equal(rows[1].rosterValue, 80)
})

test('draft picks are excluded from roster value but counted separately', () => {
  const rows = computePowerRankings(
    [p('A', 'a1', 50), pick('A', '2027 R1'), pick('A', '2027 R2'), p('B', 'b1', 60)],
    TEAMS, SEASON,
  )
  const a = rows.find((r) => r.teamName === 'A')
  assert.equal(a.rosterValue, 50, 'picks must not inflate roster strength')
  assert.equal(a.pickCount, 2)
  assert.equal(a.playerCount, 1)
  // B still outranks A despite holding no picks
  assert.equal(rows[0].teamName, 'B')
})

test('starValue captures the top 5 only; depth is the remainder', () => {
  const roster = [90, 80, 70, 60, 50, 40, 30].map((v, i) => p('A', `a${i}`, v))
  const rows = computePowerRankings([...roster, p('B', 'b1', 1)], TEAMS, SEASON)
  const a = rows.find((r) => r.teamName === 'A')
  assert.equal(a.rosterValue, 420)
  assert.equal(a.starValue, 350) // 90+80+70+60+50
  assert.equal(a.depthValue, 70) // 40+30
})

test('starShare separates a top-heavy roster from a balanced one at equal value', () => {
  // Needs rosters longer than STAR_COUNT to mean anything — on a roster of
  // 5 or fewer everyone IS the top 5, so both teams would read 100%.
  // Both totals below are 200 across 8 players.
  const topHeavy = [80, 60, 40, 10, 5, 2, 2, 1].map((v, i) => p('A', `a${i}`, v))
  const balanced = [25, 25, 25, 25, 25, 25, 25, 25].map((v, i) => p('B', `b${i}`, v))
  const rows = computePowerRankings([...topHeavy, ...balanced], TEAMS, SEASON)
  const a = rows.find((r) => r.teamName === 'A')
  const b = rows.find((r) => r.teamName === 'B')
  assert.equal(a.rosterValue, b.rosterValue, 'same total value')
  assert.ok(a.starShare > b.starShare, 'top-heavy team has a higher star share')
  assert.equal(b.starShare, 125 / 200, 'evenly-spread roster puts exactly 5/8 of value in its top 5')
})

test('tied roster values share a rank', () => {
  const rows = computePowerRankings([p('A', 'a1', 75), p('B', 'b1', 75)], TEAMS, SEASON)
  assert.equal(rows[0].rank, 1)
  assert.equal(rows[1].rank, 1)
})

test('cap total flags teams over the $300 threshold', () => {
  const rows = computePowerRankings(
    [p('A', 'a1', 250), p('A', 'a2', 100), p('B', 'b1', 40)],
    TEAMS, SEASON,
  )
  const a = rows.find((r) => r.teamName === 'A')
  const b = rows.find((r) => r.teamName === 'B')
  assert.equal(a.capTotal, 350)
  assert.equal(a.overCap, true)
  assert.equal(a.capRoom, -50)
  assert.equal(b.overCap, false)
  assert.equal(b.capRoom, 260)
})

test('in-season waiver pickups count as roster value but are cap-exempt', () => {
  // A free agent added during the active season is exempt from the tax
  // (contracts.countsTowardCap) — but he is still a real player on the roster.
  const waiver = p('A', 'waiver', 30, { playerPool: 'Free Agent', purchaseYear: SEASON })
  const rows = computePowerRankings([p('A', 'a1', 100), waiver, p('B', 'b1', 10)], TEAMS, SEASON)
  const a = rows.find((r) => r.teamName === 'A')
  assert.equal(a.rosterValue, 130, 'waiver add is real strength')
  assert.equal(a.capTotal, 100, 'but is exempt from the luxury tax')
})

test('a team with no players is handled without dividing by zero', () => {
  const rows = computePowerRankings([p('B', 'b1', 10)], TEAMS, SEASON)
  const a = rows.find((r) => r.teamName === 'A')
  assert.equal(a.rosterValue, 0)
  assert.equal(a.starShare, 0)
  assert.equal(a.playerCount, 0)
})

test('topPlayers lists the three most expensive, highest first', () => {
  const rows = computePowerRankings(
    [p('A', 'cheap', 5), p('A', 'stud', 90), p('A', 'mid', 40), p('A', 'other', 20), p('B', 'b', 1)],
    TEAMS, SEASON,
  )
  const a = rows.find((r) => r.teamName === 'A')
  assert.deepEqual(a.topPlayers.map((x) => x.name), ['stud', 'mid', 'other'])
})

test('leagueCapSummary reports over-cap count and value spread', () => {
  const rows = computePowerRankings(
    [p('A', 'a1', 310), p('B', 'b1', 50)],
    TEAMS, SEASON,
  )
  const s = leagueCapSummary(rows)
  assert.equal(s.overCount, 1)
  assert.equal(s.maxValue, 310)
  assert.equal(s.minValue, 50)
  assert.equal(s.avgCap, 180)
})

test('leagueCapSummary on an empty league returns zeros rather than NaN', () => {
  const s = leagueCapSummary([])
  assert.equal(s.overCount, 0)
  assert.equal(s.avgCap, 0)
})
