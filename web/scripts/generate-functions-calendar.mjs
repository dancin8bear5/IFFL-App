// generate-functions-calendar — the league calendar, exported for Cloud Functions.
//
// The calendar lives in ONE place: `milestones` in web/src/data/staticData.js.
// Cloud Functions can't import the web app, so the League Feed's calendar
// notices read functions/calendar.json, which this script writes. Nobody
// edits that file by hand, and web/src/services/calendarExport.test.js fails
// `npm test` the moment it disagrees with staticData.
//
//   node scripts/generate-functions-calendar.mjs --write     (from web/)
//
// Without --write it prints what it would write.
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { milestones } from '../src/data/staticData.js'

const pad = (n) => String(n).padStart(2, '0')
// staticData builds LOCAL dates (new Date(2026, 6, 16)); read them back with
// local getters so the calendar day survives whatever zone this runs in.
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export function calendarExport(list = milestones) {
  return list.map((m) => ({
    name: m.name, icon: m.icon ?? '', date: ymd(m.date),
    ...(m.time ? { time: m.time } : {}),
    ...(m.phase ? { phase: m.phase } : {}),
    ...(m.tentative ? { tentative: true } : {}),
  }))
}

export const CALENDAR_PATH = fileURLToPath(new URL('../../functions/calendar.json', import.meta.url))
export const calendarJson = () => JSON.stringify(calendarExport(), null, 2) + '\n'

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--write')) {
    writeFileSync(CALENDAR_PATH, calendarJson())
    console.log(`wrote ${CALENDAR_PATH} (${calendarExport().length} milestones)`)
  } else {
    process.stdout.write(calendarJson())
    console.error('\n(dry run — pass --write to update functions/calendar.json)')
  }
}
