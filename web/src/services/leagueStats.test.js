import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseRecord, computeAllTimeStats, computeRecords, defaultSort,
  computeSuperlatives, computeDroughts,
} from './leagueStats.js'
import { isActiveTeam } from '../data/staticData.js'

const HISTORY = [
  {
    season: 2024, champion: 'Bill', runnerUp: 'Abad',
    standings: [
      { teamName: 'Bill', place: 1, record: '12-2', pointsFor: 1900 },
      { teamName: 'Abad', place: 2, record: '9-5', pointsFor: 1780 },
      { teamName: 'Jared', place: 3, record: '9-5', pointsFor: 1750 },
      { teamName: 'Ryan', place: 7, record: '6-8', pointsFor: 1600 },
    ],
  },
  {
    season: 2025, champion: 'Bill', runnerUp: 'Jared',
    standings: [
      { teamName: 'Bill', place: 1, record: '11-3', pointsFor: 1890 },
      { teamName: 'Jared', place: 2, record: '10-3-1', pointsFor: 1850 },
      { teamName: 'Abad', place: 4, record: '8-6', pointsFor: 1700 },
      { teamName: 'Ryan', place: 6, record: '7-7', pointsFor: 1650 },
    ],
  },
]

test('parseRecord handles W-L and W-L-T and junk', () => {
  assert.deepEqual(parseRecord('11-3'), { w: 11, l: 3, t: 0 })
  assert.deepEqual(parseRecord('10-3-1'), { w: 10, l: 3, t: 1 })
  assert.deepEqual(parseRecord(null), { w: 0, l: 0, t: 0 })
})

test('career totals accumulate across seasons', () => {
  const rows = computeAllTimeStats(HISTORY)
  const bill = rows.find((r) => r.team === 'Bill')
  assert.equal(bill.seasons, 2)
  assert.equal(bill.w, 23)
  assert.equal(bill.l, 5)
  assert.equal(bill.championships, 2)
  assert.equal(bill.finals, 2)
  assert.equal(bill.top3, 2)
  assert.equal(bill.playoffs, 2)
  assert.equal(bill.pointsFor, 3790)
  assert.equal(bill.bestFinish, 1)
})

test('ties count as half-wins in pct; finals = champ + runner-up', () => {
  const rows = computeAllTimeStats(HISTORY)
  const jared = rows.find((r) => r.team === 'Jared')
  // 19W 8L 1T → (19 + 0.5) / 28
  assert.ok(Math.abs(jared.pct - 19.5 / 28) < 1e-9)
  assert.equal(jared.finals, 1) // runner-up 2025
  assert.equal(jared.championships, 0)
})

test('playoff cutoff is top 8 (2025 League Document)', () => {
  const rows = computeAllTimeStats(HISTORY)
  const ryan = rows.find((r) => r.team === 'Ryan')
  assert.equal(ryan.playoffs, 2) // 7th in 2024 and 6th in 2025 both make the top 8
})

test('defaultSort puts most belts first', () => {
  const sorted = defaultSort(computeAllTimeStats(HISTORY))
  assert.equal(sorted[0].team, 'Bill')
})

test('superlatives: best/worst season and turnaround/collapse', () => {
  const sup = computeSuperlatives(HISTORY)
  assert.equal(sup.bestSeason.team, 'Bill') // 12-2 in 2024
  assert.equal(sup.bestSeason.season, 2024)
  assert.equal(sup.worstSeason.team, 'Ryan') // 6-8 in 2024
  // Jared 3rd → 2nd and Ryan 7th → 6th tie at +1; first found wins
  assert.equal(sup.turnaround.from - sup.turnaround.to, 1)
  assert.ok(['Jared', 'Ryan'].includes(sup.turnaround.team))
  assert.equal(sup.collapse.team, 'Abad')
  assert.deepEqual([sup.collapse.from, sup.collapse.to], [2, 4])
})

test('droughts count from the latest season; never-titled sorts last', () => {
  const rows = computeDroughts(HISTORY)
  const bill = rows.find((r) => r.team === 'Bill')
  assert.equal(bill.lastTitle, 2025)
  assert.equal(bill.titleDrought, 0) // active champ
  const ryan = rows.find((r) => r.team === 'Ryan')
  assert.equal(ryan.lastTitle, null)
  assert.equal(ryan.titleDrought, null)
  const jared = rows.find((r) => r.team === 'Jared')
  assert.equal(jared.lastTop3, 2025) // runner-up counts as top 3
  assert.equal(jared.top3Drought, 0)
  // ordering: titled teams first (fresh belts first), never-titled after
  assert.equal(rows[0].team, 'Bill')
  assert.ok(rows.findIndex((r) => r.team === 'Ryan') > rows.findIndex((r) => r.team === 'Bill'))
})

test('champion-only shell season still yields a place-1 finish', () => {
  const withShell = [...HISTORY, { season: 2008, champion: 'M. Zurek', runnerUp: null, standings: [] }]
  const rows = computeDroughts(withShell)
  const mz = rows.find((r) => r.team === 'M. Zurek')
  assert.equal(mz.lastTitle, 2008)
  assert.equal(mz.titleDrought, 2025 - 2008)
})

test('records wall includes title streak for back-to-back champs', () => {
  const rows = computeAllTimeStats(HISTORY)
  const records = computeRecords(rows, HISTORY)
  const streak = records.find((r) => r.label === 'Longest Title Streak')
  assert.ok(streak)
  assert.equal(streak.team, 'Bill')
  assert.equal(streak.value, '2 straight')
})

// ── Record eligibility — former members can't hold the wall ──────────
// 'Eric' is not in fantasyTeams, so isActiveTeam('Eric') is false.
const withFormer = [
  { season: 2012, champion: 'Eric', runnerUp: 'Jared', standings: [
    { teamName: 'Eric', place: 1, record: '13-1', pointsFor: 2000 },
    { teamName: 'Jared', place: 2, record: '4-10', pointsFor: 900 },
  ] },
  { season: 2013, champion: 'Eric', runnerUp: 'Jared', standings: [
    { teamName: 'Eric', place: 1, record: '13-1', pointsFor: 2000 },
    { teamName: 'Jared', place: 2, record: '9-5', pointsFor: 1400 },
  ] },
  { season: 2014, champion: 'Jared', runnerUp: 'Bill', standings: [
    { teamName: 'Jared', place: 1, record: '10-4', pointsFor: 1500 },
    { teamName: 'Bill', place: 2, record: '9-5', pointsFor: 1450 },
    { teamName: 'Eric', place: 3, record: '8-6', pointsFor: 1400 },
  ] },
]

const activeOnly = (team) => isActiveTeam(team)

test('a departed manager holds every record when nothing is filtered', () => {
  const rows = computeAllTimeStats(withFormer)
  const recs = computeRecords(rows, withFormer)
  const holders = new Set(recs.map((r) => r.team))
  assert.ok(holders.has('Eric'), 'unfiltered wall should still credit Eric')
})

test('no record is held by a former member once eligibility is applied', () => {
  const rows = computeAllTimeStats(withFormer)
  const recs = computeRecords(rows, withFormer, activeOnly)
  assert.ok(recs.length > 0, 'filtering must not empty the wall')
  for (const r of recs) {
    assert.ok(isActiveTeam(r.team), `${r.label} still credits ${r.team}`)
  }
})

test("a former member's title streak is not the league's longest streak", () => {
  // Eric went back-to-back in 2012-13; no active team ever repeated.
  const rows = computeAllTimeStats(withFormer)
  const unfiltered = computeRecords(rows, withFormer).find((r) => r.label === 'Longest Title Streak')
  assert.equal(unfiltered?.team, 'Eric')
  const filtered = computeRecords(rows, withFormer, activeOnly).find((r) => r.label === 'Longest Title Streak')
  assert.equal(filtered, undefined, 'Eric’s streak must not survive the filter')
})

test('superlatives skip former members but keep their effect on the standings', () => {
  const all = computeSuperlatives(withFormer)
  assert.equal(all.bestSeason.team, 'Eric')

  const filtered = computeSuperlatives(withFormer, activeOnly)
  assert.equal(filtered.bestSeason.team, 'Jared')
  assert.equal(filtered.bestSeason.season, 2014)
  assert.ok(isActiveTeam(filtered.worstSeason.team))
  // Jared's 2013 -> 2014 rise is measured against the real finishing order,
  // which still included Eric — filtering changes who is reported, not places.
  assert.equal(filtered.turnaround?.team, 'Jared')
  assert.equal(filtered.turnaround?.from, 2)
  assert.equal(filtered.turnaround?.to, 1)
})

test('eligibility defaults to open, so existing callers are unaffected', () => {
  const rows = computeAllTimeStats(withFormer)
  assert.deepEqual(computeRecords(rows, withFormer), computeRecords(rows, withFormer, () => true))
  assert.deepEqual(computeSuperlatives(withFormer), computeSuperlatives(withFormer, () => true))
})
