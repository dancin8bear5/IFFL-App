import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dueWeek, decide, recordOk, recordFail, centralWall, SEASON, MAX_ATTEMPTS } from './due.mjs'
import { lastFinishedWeek } from '../../web/scripts/scrape-espn-week.mjs'

const at = (iso) => new Date(iso)
// Week 12's Monday is Nov 30, 2026. 11:59pm CST = Dec 1 05:59Z.
const BEFORE = at('2026-12-01T05:58:00Z'), ON_TIME = at('2026-12-01T05:59:00Z')

test('the week comes due at Monday 11:59pm Central — not a minute before', () => {
  assert.equal(dueWeek(BEFORE), 11)
  assert.equal(dueWeek(ON_TIME), 12)
  assert.equal(dueWeek(at('2026-12-08T05:58:00Z')), 12)
  assert.equal(dueWeek(at('2026-09-15T04:59:00Z')), 1)   // week 1, during CDT
  assert.equal(dueWeek(at('2026-09-01T00:00:00Z')), 0)   // before the season
  assert.equal(dueWeek(at('2027-03-01T00:00:00Z')), 17)  // capped: no week 18+
})

test('the clock read is Central wherever the Mac is', () => {
  // Same instant; the process time zone must not matter.
  const tz = process.env.TZ
  try {
    for (const z of ['America/New_York', 'America/Los_Angeles', 'Asia/Tokyo']) {
      process.env.TZ = z
      assert.equal(centralWall(ON_TIME), Date.UTC(2026, 10, 30, 23, 59), z)
    }
  } finally { if (tz === undefined) delete process.env.TZ; else process.env.TZ = tz }
})

test('whenever a week is due, the scraper already agrees it is finished', () => {
  for (let w = 1; w <= 17; w++) {
    const run = at(new Date(Date.UTC(2026, 8, 15, 4, 59) + (w - 1) * 7 * 864e5).toISOString())
    if (dueWeek(run) === w) assert.ok(lastFinishedWeek(run) >= w, `week ${w}`)
  }
  assert.ok(lastFinishedWeek(ON_TIME) >= dueWeek(ON_TIME))
})

test('decide: runs when due, once', () => {
  const done11 = { season: SEASON, lastDoneWeek: 11 }
  assert.equal(decide(done11, BEFORE), null)
  assert.deepEqual(decide(done11, ON_TIME).args, ['--week', '12'])
  assert.equal(decide(recordOk(done11, 12), ON_TIME), null)
})

test('decide: the Nov 24 case — Mac off at the slot, back hours or days later, still runs', () => {
  const done10 = { season: SEASON, lastDoneWeek: 10 }
  assert.deepEqual(decide(done10, at('2026-11-25T02:16:00Z')).args, ['--week', '11'])   // booted that night
  assert.deepEqual(decide(done10, at('2026-11-28T15:00:00Z')).args, ['--week', '11'])   // or days later
  // Off across two Mondays: both weeks are owed, oldest first.
  assert.deepEqual(decide(done10, at('2026-12-02T15:00:00Z')).args, ['--weeks', '11-12'])
})

test('decide: no state, or a broken one, runs the due week rather than nothing', () => {
  for (const s of [null, undefined, 'x', {}, { season: 2025, lastDoneWeek: 17 }]) {
    assert.deepEqual(decide(s, ON_TIME).args, ['--week', '12'])
  }
})

test('decide: a failed run waits an hour, and gives up after six for that week only', () => {
  let s = recordFail({ season: SEASON, lastDoneWeek: 11 }, ON_TIME)
  assert.equal(decide(s, at('2026-12-01T06:30:00Z')), null)                       // 31 min later
  assert.deepEqual(decide(s, at('2026-12-01T07:00:00Z')).args, ['--week', '12'])  // an hour later
  for (let i = 1; i < MAX_ATTEMPTS; i++) s = recordFail(s, ON_TIME)
  assert.equal(decide(s, at('2026-12-03T00:00:00Z')), null)                       // six strikes
  // Next Monday is a new week and a clean slate; week 12 rides along.
  assert.deepEqual(decide(s, at('2026-12-08T05:59:00Z')).args, ['--weeks', '12-13'])
})
