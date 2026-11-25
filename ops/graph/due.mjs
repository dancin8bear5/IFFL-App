// due — "is the weekly score job owed right now?"
//
// launchd used to be trusted with the calendar (Tuesday 08:00, then Monday
// 23:30). It failed twice over, and both are launchd's nature, not bugs:
//
//   • It never makes up a run missed while the Mac was POWERED OFF. On
//     Nov 24, 2026 the Mac shut down at 08:50, ten minutes before the slot,
//     came back at 21:16, and week 11 simply never ran.
//   • It keeps the time zone the Mac BOOTED in. The same "08:00" fired at
//     06:00, 08:00 and 10:00 Central across three weeks of travel.
//
// So launchd no longer owns the calendar. It wakes this check every few
// minutes (and at every login), and the answer is worked out here from the
// America/Chicago clock and a small state file:
//
//   due   = the latest week whose Monday 11:59pm Central has passed
//   owed  = every week after the last one done, up to `due`
//
// On at 11:59pm Monday → it runs at 11:59pm. Off, asleep or travelling →
// it runs at the first check after the Mac is back. Nothing is skipped.
//
// Pure functions + a 20-line CLI. No network: the state file is the memory.
//
//   node ops/graph/due.mjs                 prints the scraper args if owed, else nothing
//   node ops/graph/due.mjs --record ok 12  week 12 is done
//   node ops/graph/due.mjs --record fail   that attempt failed
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const MIN = 60 * 1000
const WEEK = 7 * 24 * 60 * MIN
export const SEASON = 2026
// Week 1's Monday night game was Sep 14, 2026 (scrape-espn-week.mjs holds the
// same anchor for its 6pm rollover; a test pins the two together).
export const WEEK1_RUN = Date.UTC(2026, 8, 14, 23, 59)   // Monday 11:59pm, as Central wall time
export const LAST_WEEK = 17                               // the fantasy season ends with week 17
export const RETRY_GAP_MIN = 60                           // after a failed run, wait this long
export const MAX_ATTEMPTS = 6                             // per week — each failure already notifies

/** Central wall-clock time as a UTC-shaped number, whatever zone the Mac is in. */
export function centralWall(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', hourCycle: 'h23',
    year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric',
  }).formatToParts(now).map((x) => [x.type, Number(x.value)]))
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute)
}

/** The latest week whose Monday 11:59pm Central has passed (0 before week 1; capped at the last week). */
export function dueWeek(now = new Date()) {
  const n = Math.floor((centralWall(now) - WEEK1_RUN) / WEEK) + 1
  return Math.max(0, Math.min(LAST_WEEK, n))
}

/**
 * What to run now, or null. `state` is the parsed state file (or null/garbage).
 * A missing or unreadable state runs the due week: the scrape replaces a
 * week's rows rather than duplicating them, so running twice is harmless
 * and not running is the failure this file exists to prevent.
 */
export function decide(state, now = new Date()) {
  const due = dueWeek(now)
  if (due < 1) return null
  const s = state && state.season === SEASON ? state : {}
  const done = Number.isInteger(s.lastDoneWeek) ? s.lastDoneWeek : due - 1
  if (done >= due) return null
  const tries = s.failWeek === due ? (s.fails ?? 0) : 0
  if (tries >= MAX_ATTEMPTS) return null
  if (tries > 0 && now.getTime() - (s.lastFailAt ?? 0) < RETRY_GAP_MIN * MIN) return null
  const from = done + 1
  return { from, to: due, args: from === due ? ['--week', String(due)] : ['--weeks', `${from}-${due}`] }
}

export function recordOk(state, week) {
  return { season: SEASON, lastDoneWeek: Math.max(week, state?.season === SEASON ? state.lastDoneWeek ?? 0 : 0) }
}
export function recordFail(state, now = new Date()) {
  const due = dueWeek(now)
  const s = state && state.season === SEASON ? state : { season: SEASON }
  return { ...s, season: SEASON, failWeek: due, fails: (s.failWeek === due ? s.fails ?? 0 : 0) + 1, lastFailAt: now.getTime() }
}

// ── CLI ────────────────────────────────────────────────────────
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const FILE = process.env.IFFL_SCORE_STATE || join(ROOT, 'out/espn-weekly-state.json')
const load = () => { try { return JSON.parse(readFileSync(FILE, 'utf8')) } catch { return null } }
const save = (s) => { mkdirSync(dirname(FILE), { recursive: true }); writeFileSync(FILE, JSON.stringify(s, null, 2) + '\n') }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, what, week] = process.argv.slice(2)
  // IFFL_NOW=2026-12-01T05:59:00Z asks the question as of another moment (checks only).
  const now = process.env.IFFL_NOW ? new Date(process.env.IFFL_NOW) : new Date()
  if (cmd === '--record' && what === 'ok') save(recordOk(load(), Number(week) || dueWeek(now)))
  else if (cmd === '--record' && what === 'fail') save(recordFail(load(), now))
  else { const d = decide(load(), now); if (d) console.log(d.args.join(' ')) }
}
