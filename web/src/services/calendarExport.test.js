// The League Feed's calendar notices run in Cloud Functions, which read
// functions/calendar.json — a GENERATED copy of `milestones`. This test is
// what keeps "the calendar is the model" true: move a date in staticData and
// forget to regenerate, and `npm test` fails here instead of the league
// getting a trade-deadline notice on the wrong day.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { CALENDAR_PATH, calendarJson, calendarExport } from '../../scripts/generate-functions-calendar.mjs'

test('functions/calendar.json matches staticData milestones', () => {
  assert.equal(
    readFileSync(CALENDAR_PATH, 'utf8'), calendarJson(),
    'calendar drifted — run: cd web && node scripts/generate-functions-calendar.mjs --write',
  )
})

test('the export keeps the calendar DAY and the five phase boundaries', () => {
  const cal = calendarExport()
  assert.equal(cal.find((m) => m.name === 'Trade Deadline').date, '2026-11-25')
  assert.deepEqual(cal.filter((m) => m.phase).map((m) => m.phase), ['preseason', 'regular', 'playoffs', 'dead', 'offseason'])
  assert.ok(cal.every((m) => /^\d{4}-\d{2}-\d{2}$/.test(m.date)))
})
