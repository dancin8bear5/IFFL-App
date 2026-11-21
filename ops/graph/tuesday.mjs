#!/usr/bin/env node
// tuesday — the weekly ESPN job, as a graph (see runner.mjs).
//
//   preflight ─▶ scrape ─┬─▶ trades ──▶ commit ─┐
//                        ├─▶ scores-check ──────┼─▶ digest
//                        └─▶ feed-check ────────┘
//
//   preflight     the gcloud login every write rides on — fails in seconds
//   scrape        web/scripts/scrape-espn-week.mjs (unchanged). Its failures
//                 get different answers: a stall retries in 10 minutes, "not
//                 final" waits 3 hours (up to 3 times), logged-out stops.
//   trades        finished trades → data/trades-2025-on.csv
//   commit        commit + push the two data files (only on main)
//   scores-check  did config/weeklyPoller record this week?
//   feed-check    did the League Feed publish the week-in-review? (Cloud
//                 Functions write it when weeklyScores lands — this only looks)
//   digest        ONE notification saying what happened
//
// trades, commit and the two checks are optional: the scores are already
// safe once `scrape` finishes, so none of them can fail the run.
//
// State is saved to out/runs/tuesday-<key>.json after every step. Re-running
// after a failure RESUMES: a scrape that succeeded is not scraped again.
//
//   node ops/graph/tuesday.mjs                 normal run (what launchd calls)
//   node ops/graph/tuesday.mjs --plan          print the steps, run nothing
//   node ops/graph/tuesday.mjs --week 9        redo one week
//   node ops/graph/tuesday.mjs --fresh         ignore saved state
//   --dry-run is passed to the scraper; the write-side steps then skip.
import { spawn, execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runGraph, levels } from './runner.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../..')
const WEB = join(ROOT, 'web')
const BASE = 'https://firestore.googleapis.com/v1/projects/iffl-auth/databases/(default)/documents'
const DATA_FILES = ['data/iffl_fantasy_history_2008-2025.csv', 'data/trades-2025-on.csv']
const MIN = 60 * 1000

const stamp = () => new Date().toISOString().slice(0, 19)
const say = (line) => console.log(`${stamp()} ${line}`)

/** Run a command, stream its output into our log, resolve {code, out}. */
function sh(cmd, args, cwd) {
  return new Promise((done) => {
    const p = spawn(cmd, args, { cwd })
    let out = ''
    const take = (b) => { out += b; process.stdout.write(b) }
    p.stdout.on('data', take)
    p.stderr.on('data', take)
    p.on('error', (e) => done({ code: 1, out: out + String(e.message) }))
    p.on('close', (code) => done({ code: code ?? 1, out }))
  })
}

const token = () => execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

async function getDoc(path) {
  const res = await fetch(`${BASE}/${path}`, { headers: { Authorization: `Bearer ${token()}` } })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`${res.status} reading ${path}`)
  return (await res.json()).fields ?? {}
}
const val = (f) => (f == null ? null : f.stringValue ?? f.booleanValue ?? (f.integerValue != null ? Number(f.integerValue) : f.doubleValue ?? null))

// ── what went wrong with a scrape, and what to do about it ─────
export function classifyScrapeFailure(output) {
  const tail = String(output ?? '').split('\n').slice(-25).join('\n')
  if (/logged out/i.test(tail)) return 'loggedOut'
  if (/not final|refusing week/i.test(tail)) return 'notFinal'
  return 'stall'
}
export const SCRAPE_FIX = {
  loggedOut: 'ESPN sign-in expired — run: cd ~/claude-agents/iffl-web-app/web && node scripts/scrape-espn-week.mjs --login',
  notFinal: 'the week still was not final after three 3-hour waits',
  stall: 'ESPN pages failed to load twice — see out/espn-weekly.log',
}
/** waitMs before the next try, or null to stop. Counts each kind separately. */
export function scrapeRetry() {
  const seen = { notFinal: 0, stall: 0 }
  return (err) => {
    const kind = err.kind ?? 'stall'
    if (kind === 'loggedOut') return null
    seen[kind]++
    if (kind === 'notFinal') return seen.notFinal <= 3 ? 180 * MIN : null
    return seen.stall <= 1 ? 10 * MIN : null
  }
}
export function parseScrapeWeek(output) {
  const m = /season (\d{4}) week\(s\) ([\d,]+)/.exec(String(output ?? ''))
  if (!m) return { season: null, weeks: [] }
  return { season: Number(m[1]), weeks: m[2].split(',').map(Number) }
}

// ── the graph ──────────────────────────────────────────────────
export function tuesdayGraph({ args = [], dryRun = false } = {}) {
  const skipIfDry = (fn) => async (ctx) => (dryRun ? 'skipped (dry run)' : fn(ctx))
  const oneWeek = (results) => (results.scrape?.weeks?.length === 1 ? results.scrape : null)

  return [
    {
      id: 'preflight', always: true, label: 'Check the gcloud login',
      run: async () => {
        try { token() } catch { throw new Error('gcloud login expired — run: gcloud auth login') }
        return 'ok' // never the token: this value is written to out/runs/
      },
    },
    {
      id: 'scrape', needs: ['preflight'], label: 'Pull the week from ESPN, validate, write Firestore + CSV',
      retry: scrapeRetry(),
      run: async () => {
        const { code, out } = await sh('node', ['scripts/scrape-espn-week.mjs', ...args], WEB)
        if (code !== 0) {
          const kind = classifyScrapeFailure(out)
          throw Object.assign(new Error(SCRAPE_FIX[kind]), { kind })
        }
        return parseScrapeWeek(out)
      },
    },
    {
      id: 'trades', needs: ['scrape'], optional: true, label: 'Export finished trades to CSV',
      run: skipIfDry(async () => {
        const { code } = await sh('node', ['scripts/export-trades.mjs', '--write'], WEB)
        if (code !== 0) throw new Error('trades export failed (scores are unaffected)')
        return 'exported'
      }),
    },
    {
      id: 'commit', needs: ['scrape', 'trades'], optional: true, label: 'Commit + push the data files (main only)',
      run: skipIfDry(async () => {
        const git = (...a) => execFileSync('git', ['-C', ROOT, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
        const branch = git('branch', '--show-current')
        if (branch !== 'main') return `skipped (on ${branch}, not main)`
        const changed = DATA_FILES.filter((f) => existsSync(join(ROOT, f)) && git('status', '--porcelain', '--', f))
        if (!changed.length) return 'nothing changed'
        git('add', '--', ...changed)
        git('commit', '-q', '-m', `data: 2026 ESPN weekly scrape ${new Date().toISOString().slice(0, 10)}`, '--', ...changed)
        git('pull', '-q', '--rebase', '--autostash', 'origin', 'main')
        git('push', '-q', 'origin', 'HEAD:main')
        return `pushed ${changed.length} file${changed.length > 1 ? 's' : ''}`
      }),
    },
    {
      id: 'scores-check', needs: ['scrape'], optional: true, label: 'Confirm the week is on record',
      run: skipIfDry(async ({ results }) => {
        const wk = oneWeek(results)
        if (!wk) return 'skipped (backfill)'
        const d = await getDoc('config/weeklyPoller')
        const latest = val(d?.latestWeek)
        if (latest !== wk.weeks[0]) throw new Error(`config/weeklyPoller says week ${latest}, expected ${wk.weeks[0]}`)
        return `week ${latest} on record`
      }),
    },
    {
      id: 'feed-check', needs: ['scrape'], optional: true, label: 'Confirm the League Feed published',
      // The Cloud Function writes the posts after weeklyScores lands; give it
      // a few minutes rather than calling a slow afternoon a failure.
      retry: (err, attempt) => (err.pending && attempt < 8 ? 45 * 1000 : null),
      run: skipIfDry(async ({ results }) => {
        const wk = oneWeek(results)
        if (!wk) return 'skipped (backfill)'
        const d = await getDoc(`leagueFeed/week-${wk.season}-w${wk.weeks[0]}`)
        if (!d) throw Object.assign(new Error('no week-in-review post yet'), { pending: true })
        return `week-in-review published (${val(d.writer) === 'template' ? 'plain version' : 'Claude'})`
      }),
    },
    {
      id: 'digest', needs: ['commit', 'scores-check', 'feed-check'], always: true, label: 'One summary notification',
      run: async ({ results }) => {
        const wk = results.scrape?.weeks?.join(',') || '?'
        const line = `Week ${wk} scraped · data: ${results.commit ?? 'not pushed'} · ${results['feed-check'] ?? 'feed not confirmed'}`
        return line
      },
    },
  ]
}

// ── run it ─────────────────────────────────────────────────────
function notify(text) {
  try {
    execFileSync('/usr/bin/osascript', ['-e', `display notification ${JSON.stringify(text)} with title "IFFL Tuesday job"`], { stdio: 'ignore' })
  } catch { /* a notification must never fail the job */ }
}

async function main() {
  const argv = process.argv.slice(2)
  const flag = (f) => argv.includes(f)
  const args = argv.filter((a) => a !== '--plan' && a !== '--fresh')
  const nodes = tuesdayGraph({ args, dryRun: flag('--dry-run') })

  if (flag('--plan')) {
    console.log('Tuesday job — steps on the same line run side by side:\n')
    levels(nodes).forEach((wave, i) => {
      console.log(`  ${i + 1}. ${wave.map((id) => { const n = nodes.find((x) => x.id === id); return `${id}${n.optional ? ' (optional)' : ''}` }).join('   |   ')}`)
      for (const id of wave) console.log(`       ${id}: ${nodes.find((x) => x.id === id).label}`)
    })
    console.log('\n(plan only — nothing was run)')
    return 0
  }

  const wi = argv.indexOf('--week')
  const key = wi >= 0 ? `w${argv[wi + 1]}` : new Date().toLocaleDateString('en-CA')
  const dir = join(ROOT, 'out', 'runs')
  const file = join(dir, `tuesday-${key}${flag('--dry-run') ? '-dry' : ''}.json`)
  mkdirSync(dir, { recursive: true })

  let state
  if (!flag('--fresh') && existsSync(file)) {
    try {
      const prev = JSON.parse(readFileSync(file, 'utf8'))
      // A run that already finished is being re-run on purpose: start over.
      if (!prev.ok) { state = prev; say(`resuming ${file}`) }
    } catch { /* unreadable state = no state */ }
  }

  const { ok, state: st, results } = await runGraph(nodes, {
    state, log: say,
    save: async (s) => writeFileSync(file, JSON.stringify({ ...s, ok: false }, null, 2)),
  })
  writeFileSync(file, JSON.stringify({ ...st, ok, finishedAt: new Date().toISOString() }, null, 2))

  const failed = nodes.filter((n) => st.nodes[n.id]?.status === 'failed')
  if (ok) {
    const warn = failed.length ? ` · ⚠️ ${failed.map((n) => n.id).join(', ')} failed` : ''
    say(`OK — ${results.digest}${warn}`)
    notify(`${results.digest}${warn}`)
    return 0
  }
  const first = failed.find((n) => !n.optional) ?? failed[0]
  const why = first ? `${first.id}: ${st.nodes[first.id].error}` : 'see out/espn-weekly.log'
  say(`FAILED — ${why}`)
  notify(`FAILED — ${why}`)
  return 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code), (e) => { say(`FAILED — ${e.message}`); notify(`FAILED — ${e.message}`); process.exit(1) })
}
