#!/usr/bin/env node
// scrape-espn-week.mjs — pull one finished week of IFFL player lines off ESPN's
// team pages and add it to the league's master history.
//
// Why the team pages: the league scores are entered on ESPN, but the box-score
// view keeps no history (it shows today's roster at 0.0). The clubhouse page
// with scoringPeriodId=N does keep the week-of lineup: slot, starter/bench, points.
//
// What it writes, for season 2026 week N:
//   1. data/iffl_fantasy_history_2008-2025.csv  — PlayerWeek + TeamWeek rows, same
//      40-column format as 2018-2025. Any existing rows for that season+week are
//      replaced, so re-running a week is safe. A timestamped copy of the CSV is
//      kept in out/history-csv-backups/ before every write (newest 12 kept).
//   2. Firestore historyPlayerWeeks/{season}-{WW} — the doc the app's
//      League History → Player Scores tab reads. Same shape import-history.mjs writes.
//   3. Firestore historyPlayerSeasons/{season} — season-to-date totals rebuilt from
//      every week of the season in the CSV, so "Season totals" works mid-season.
//
// Fail closed: nothing is written unless all 12 teams load, every starter's
// game is final, every team's starters add up to its ESPN total, and those totals
// match the scoreboard. Exit 1 on any failure (the shell wrapper notifies).
//
// Usage (from web/):
//   node scripts/scrape-espn-week.mjs --login            one-time: sign in to ESPN in the window
//   node scripts/scrape-espn-week.mjs                    the week that just finished (auto)
//   node scripts/scrape-espn-week.mjs --week 8 [--dry-run]
//   node scripts/scrape-espn-week.mjs --weeks 1-7        backfill
//   node scripts/scrape-espn-week.mjs --from-json f.json build + validate from a saved
//                                                        scrape (tests; no browser)
import { readFileSync, writeFileSync, renameSync, mkdirSync, readdirSync, unlinkSync, copyFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../..')
const CSV = process.env.IFFL_HISTORY_CSV || join(REPO, 'data/iffl_fantasy_history_2008-2025.csv')
const IDMAP = join(REPO, 'data/espn-team-identity-map.json')
const OUT = process.env.IFFL_OUT_DIR || join(REPO, 'out')
const PROFILE = process.env.ESPN_PROFILE_DIR || join(REPO, '.espn-chrome-profile')
const LEAGUE = 331652
const SEASON = 2026
// Week 1's Monday night game was Sep 14, 2026, so week N is final by Tuesday Sep 15 + 7(N-1).
const WEEK1_TUESDAY = Date.UTC(2026, 8, 15)
const PROJECT = 'iffl-auth'
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`

const argv = process.argv.slice(2)
const flag = (f) => argv.includes(f)
const opt = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined }
const dryRun = flag('--dry-run')
const log = (...a) => console.log(new Date().toISOString().slice(0, 19), ...a)

// ── week selection ─────────────────────────────────────────────
export function lastFinishedWeek(now = new Date()) {
  const ct = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }))
  const today = Date.UTC(ct.getFullYear(), ct.getMonth(), ct.getDate())
  return Math.floor((today - WEEK1_TUESDAY) / 86400000 / 7) + 1
}
function weeksToRun() {
  if (opt('--week')) return [Number(opt('--week'))]
  if (opt('--weeks')) { const [a, b] = opt('--weeks').split('-').map(Number); return Array.from({ length: b - a + 1 }, (_, i) => a + i) }
  return [lastFinishedWeek()]
}

// ── browser-side extraction (runs inside the ESPN page) ────────
// Returns raw cells; all interpretation happens in buildWeek() so it can be tested offline.
export function extractClubhouse() {
  const SLOT = /^(QB|RB|WR|TE|FLEX|SFLEX|OP|D\/ST|K|Bench|IR)$/
  const text = (el) => (el?.innerText || '').replace(/\s+/g, ' ').trim()
  // Read the week from the starters table header ("STARTERS | NFL WEEK 7 | 2026 SEASON"),
  // not the page body: the week picker lists every week, so the body always contains "NFL WEEK 1".
  const head = [...document.querySelectorAll('table thead')].map((t) => t.innerText).join(' ')
  const week = Number((head.match(/NFL WEEK (\d+)/i) || [])[1] || 0)
  const team = document.title.replace(/ Clubhouse.*/, '').trim()
  const rows = [], totals = []
  for (const table of document.querySelectorAll('table')) {
    const hdr = [...table.querySelectorAll('thead tr')].map((tr) => [...tr.querySelectorAll('th,td')].map(text)).find((h) => h.includes('SLOT'))
    if (!hdr) continue
    const ix = (name) => hdr.indexOf(name)
    for (const tr of table.querySelectorAll('tbody tr')) {
      const tds = [...tr.querySelectorAll('td')]
      const cells = tds.map(text)
      const t = cells.indexOf('TOTALS')
      if (t >= 0) { totals.push({ proj: cells[t + 1], pts: cells[t + 2] }); continue }
      const slot = cells[ix('SLOT')]
      if (!SLOT.test(slot || '')) continue
      const pcell = tds[ix('PLAYER')]
      const src = [...(pcell?.querySelectorAll('img') || [])].map((i) => i.getAttribute('src') || '').join(' ')
      rows.push({
        slot,
        player: cells[ix('PLAYER')],
        espnId: (src.match(/players\/full\/(\d+)/) || [])[1] || null,
        opp: cells[ix('OPP')],
        status: cells[ix('STATUS')],
        proj: cells[ix('PROJ')],
        score: cells[ix('SCORE')],
      })
    }
  }
  return { week, team, rows, totals }
}

export function extractScoreboard() {
  const L = document.body.innerText.split('\n').map((s) => s.trim()).filter(Boolean)
  const g = []
  for (let i = 0; i < L.length - 2; i++) {
    if (/^\(\d+-\d+-\d+, \d+\w\w\)$/.test(L[i + 1]) && /^\d+(\.\d+)?$/.test(L[i + 2])) g.push({ team: L[i], score: Number(L[i + 2]) })
  }
  const games = []
  for (let i = 0; i + 1 < g.length; i += 2) games.push([g[i], g[i + 1]])
  return games
}

// ── reference data from the master CSV ─────────────────────────
function loadReference() {
  const lines = readFileSync(CSV, 'utf8').split(/\r?\n/).filter(Boolean)
  const header = lines[0].split(',')
  const col = Object.fromEntries(header.map((h, i) => [h, i]))
  const proCase = new Map() // 'ATL' -> 'Atl'
  const dstId = new Map() //   'Atl' -> '-16001'
  const nameId = new Map() //  'drake london|WR' -> '4426502' (latest season wins)
  for (const l of lines.slice(1)) {
    const r = l.split(',')
    if (r[0] !== 'PlayerWeek' && r[0] !== 'PlayerSeason') continue
    const pro = r[col.ProTeam], pos = r[col.Position], id = r[col.PlayerId], name = r[col.Player]
    if (pro) proCase.set(pro.toUpperCase(), pro)
    if (pos === 'D/ST' && pro && id) dstId.set(pro, id)
    if (id && name) nameId.set(`${normName(name)}|${pos}`, id)
  }
  const idmap = JSON.parse(readFileSync(IDMAP, 'utf8')).seasons
  const owners = idmap[String(SEASON)] || idmap[String(Math.max(...Object.keys(idmap).map(Number)))]
  return { lines, header, col, proCase, dstId, nameId, owners }
}
const normName = (s) => s.toLowerCase().replace(/[^a-z]/g, '').replace(/(jr|sr|iii|ii|iv|v)$/, '')

// ── interpretation + validation (pure) ─────────────────────────
const SLOT_CODE = { Bench: 'BE', SFLEX: 'OP' }
const INJ = /^(Q|O|D|IR|SSPD|P|PUP|NA|DNR)$/
const num = (s) => { const n = Number(s); return s === '--' || s === '' || s == null || Number.isNaN(n) ? 0 : n }
const r2 = (x) => Math.round(x * 100) / 100

export function buildWeek(week, pages, games, ref) {
  const errors = [], warnings = []
  const byTeamName = new Map()
  const playerRows = [], teams = []
  if (pages.length !== 12) errors.push(`expected 12 team pages, got ${pages.length}`)
  for (const p of pages) {
    if (p.week !== week) errors.push(`team ${p.teamId}: page shows NFL WEEK ${p.week}, wanted ${week}`)
    if (p.totals.length < 1) errors.push(`team ${p.teamId}: no TOTALS row (not loaded / logged out?)`)
    byTeamName.set(p.team, p.teamId)
    let starterSum = 0, benchSum = 0, starters = 0
    for (const r of p.rows) {
      if (/^Empty\b/.test(r.player)) continue
      // "Ja'Marr Chase Q CIN WR", "Seahawks SEA D/ST", "Travis Hunter JAX WR, CB"
      const m = r.player.match(/^(.*?)\s+([A-Z]{2,3})\s+((?:D\/ST|[A-Z]{1,3})(?:,\s*(?:D\/ST|[A-Z]{1,3}))*)$/)
      if (!m) { errors.push(`${p.team}: cannot parse player cell "${r.player}"`); continue }
      const posList = m[3].split(/,\s*/)
      const pos = posList.find((x) => /^(QB|RB|WR|TE|K|D\/ST)$/.test(x)) || posList[0]
      const proUpper = m[2]
      const tok = m[1].split(' ')
      if (tok.length > 1 && INJ.test(tok.at(-1))) tok.pop()
      const name = tok.join(' ')
      const status = r.slot === 'Bench' ? 'Bench' : r.slot === 'IR' ? 'IR' : 'Starter'
      const pts = num(r.score)
      const proTeam = ref.proCase.get(proUpper) || proUpper
      let id = r.espnId
      if (!id && pos === 'D/ST') id = ref.dstId.get(proTeam) || null
      if (!id) id = ref.nameId.get(`${normName(name)}|${pos}`) || null
      if (!id) warnings.push(`no ESPN id for ${name} (${pos}, ${proTeam})`)
      if (status === 'Starter') {
        starters++; starterSum += pts
        if (/\b\d{1,2}:\d{2}\s?(AM|PM)\b/i.test(r.status || '')) errors.push(`week ${week} not final: ${p.team} starter ${name} shows "${r.status}"`)
      } else if (status === 'Bench') benchSum += pts
      playerRows.push({ teamId: p.teamId, playerId: id, player: name, position: pos, proTeam, slot: SLOT_CODE[r.slot] || r.slot, status, points: pts })
    }
    const espnTotal = num(p.totals[0]?.pts)
    if (starters < 9) errors.push(`${p.team}: only ${starters} starters`)
    if (Math.abs(r2(starterSum) - espnTotal) > 0.011) errors.push(`${p.team}: starters add to ${r2(starterSum)} but ESPN total is ${espnTotal}`)
    teams.push({ teamId: p.teamId, team: p.team, score: espnTotal, bench: r2(benchSum) })
  }
  // opponents + scoreboard cross-check
  if (games.length !== 6) errors.push(`scoreboard: expected 6 games, got ${games.length}`)
  const opp = new Map()
  for (const [a, b] of games) {
    const ia = byTeamName.get(a.team), ib = byTeamName.get(b.team)
    if (!ia || !ib) { errors.push(`scoreboard team not matched to a clubhouse page: ${!ia ? a.team : b.team}`); continue }
    opp.set(ia, { id: ib, team: b.team, score: b.score, own: a.score })
    opp.set(ib, { id: ia, team: a.team, score: a.score, own: b.score })
  }
  const teamRows = []
  for (const t of teams) {
    const o = opp.get(t.teamId)
    if (!o) { errors.push(`${t.team}: no scoreboard game`); continue }
    if (Math.abs(o.own - t.score) > 0.011) errors.push(`${t.team}: clubhouse ${t.score} vs scoreboard ${o.own}`)
    const margin = r2(t.score - o.score)
    teamRows.push({ ...t, oppId: o.id, oppTeam: o.team, oppScore: o.score, margin, result: margin > 0 ? 'W' : margin < 0 ? 'L' : 'T' })
  }
  const dupes = new Set(), seen = new Set()
  for (const r of playerRows) { const k = `${r.playerId || r.player}|${r.proTeam}`; if (seen.has(k)) dupes.add(k); seen.add(k) }
  if (dupes.size) errors.push(`player on two rosters in one week: ${[...dupes].join(', ')}`)
  return { week, playerRows, teamRows, errors, warnings }
}

// ── CSV ───────────────────────────────────────────────────────
function csvLine(header, fields) {
  return header.map((h) => {
    const v = String(fields[h] ?? '')
    if (/[,\r\n"]/.test(v)) throw new Error(`"${v}" (${h}) would break the unquoted 40-column CSV`)
    return v
  }).join(',')
}
export function toCsvLines(ref, wk) {
  const out = []
  for (const t of [...wk.teamRows].sort((a, b) => a.teamId - b.teamId)) {
    out.push(csvLine(ref.header, { RecordType: 'TeamWeek', Season: SEASON, Week: wk.week, TeamId: t.teamId, TeamName: t.team,
      OpponentTeamId: t.oppId, OpponentName: t.oppTeam, TeamScore: t.score, OpponentScore: t.oppScore, Margin: t.margin, Winner: t.result, TeamBenchPoints: t.bench }))
  }
  for (const r of wk.playerRows) {
    if (/[,\n]/.test(r.player)) throw new Error(`comma in player name breaks the unquoted CSV: ${r.player}`)
    out.push(csvLine(ref.header, { RecordType: 'PlayerWeek', Season: SEASON, Week: wk.week, TeamId: r.teamId, PlayerId: r.playerId ?? '',
      Player: r.player, Position: r.position, ProTeam: r.proTeam, LineupSlot: r.slot, Status: r.status, WeeklyPoints: r.points }))
  }
  return out
}
function writeCsv(ref, weeksBuilt) {
  mkdirSync(join(OUT, 'history-csv-backups'), { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  copyFileSync(CSV, join(OUT, 'history-csv-backups', `iffl_fantasy_history_${stamp}.csv`))
  const keep = readdirSync(join(OUT, 'history-csv-backups')).filter((f) => f.endsWith('.csv')).sort()
  for (const f of keep.slice(0, -12)) unlinkSync(join(OUT, 'history-csv-backups', f))

  const raw = readFileSync(CSV, 'utf8')
  const eol = raw.includes('\r\n') ? '\r\n' : '\n'
  const endsWithEol = raw.endsWith(eol)
  const drop = new Set(weeksBuilt.map((w) => w.week))
  const kept = raw.split(/\r?\n/).filter((l, i, a) => !(i === a.length - 1 && l === ''))
    .filter((l) => { const [t, s, w] = l.split(','); return !((t === 'PlayerWeek' || t === 'TeamWeek') && Number(s) === SEASON && drop.has(Number(w))) })
  const added = weeksBuilt.flatMap((w) => toCsvLines(ref, w))
  const next = [...kept, ...added].join(eol) + (endsWithEol ? eol : '')
  const tmp = `${CSV}.tmp`
  writeFileSync(tmp, next)
  renameSync(tmp, CSV)
  return { before: raw.split(/\r?\n/).filter(Boolean).length, after: kept.length + added.length, added: added.length, replaced: raw.split(/\r?\n/).filter(Boolean).length - kept.length }
}

// ── Firestore (same encoding + doc shape as import-history.mjs) ─
function encodeValue(v) {
  if (v === null || v === undefined) return { nullValue: null }
  if (typeof v === 'boolean') return { booleanValue: v }
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }
  if (typeof v === 'string') return { stringValue: v }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encodeValue) } }
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encodeValue(x)])) } }
}
export function toFirestoreDoc(ref, wk) {
  const rows = wk.playerRows.map((r) => ({
    team: ref.owners[String(r.teamId)] ?? `ESPN#${r.teamId}`,
    playerId: r.playerId || null, player: r.player, position: r.position || null, proTeam: r.proTeam || null,
    slot: r.slot || null, status: r.status || null, points: r.points,
  })).sort((a, b) => String(a.team).localeCompare(String(b.team)) || (b.points ?? 0) - (a.points ?? 0))
  return { path: `historyPlayerWeeks/${SEASON}-${String(wk.week).padStart(2, '0')}`, data: { season: SEASON, week: wk.week, source: 'espn-weekly-scrape', rows } }
}
// Season-to-date totals for the season in progress, rebuilt from EVERY week of
// it in the CSV (not just this run's), so a re-run or a backfill always lands on
// the same doc. Same row shape as import-history.mjs's historyPlayerSeasons;
// ESPN's own PlayerSeason rows only exist once a season is over. A player who
// changed rosters counts once, under his most recent team.
export function toSeasonDoc(ref, csvLines) {
  const c = ref.col
  const byPlayer = new Map()
  let throughWeek = 0
  for (const l of csvLines) {
    const r = l.split(',')
    if (r[0] !== 'PlayerWeek' || Number(r[c.Season]) !== SEASON) continue
    const week = Number(r[c.Week]), pts = Number(r[c.WeeklyPoints]) || 0
    throughWeek = Math.max(throughWeek, week)
    const key = r[c.PlayerId] || `${r[c.Player]}|${r[c.Position]}`
    const p = byPlayer.get(key) ?? { weeks: [], last: null }
    p.weeks.push({ week, pts })
    if (!p.last || week >= p.last.week) p.last = { week, teamId: r[c.TeamId], playerId: r[c.PlayerId], player: r[c.Player], position: r[c.Position], proTeam: r[c.ProTeam], slot: r[c.LineupSlot] }
    byPlayer.set(key, p)
  }
  const rows = [...byPlayer.values()].map(({ weeks, last }) => {
    const played = weeks.filter((w) => w.pts !== 0).map((w) => w.pts)
    const points = r2(weeks.reduce((s, w) => s + w.pts, 0))
    return {
      team: ref.owners[String(last.teamId)] ?? `ESPN#${last.teamId}`,
      playerId: last.playerId || null, player: last.player, position: last.position || null, proTeam: last.proTeam || null,
      points, avg: played.length ? r2(points / played.length) : 0, games: played.length,
      posRank: null, high: played.length ? Math.max(...played) : null, low: played.length ? Math.min(...played) : null,
      weeksTracked: weeks.length, finalSlot: last.slot || null,
    }
  }).sort((a, b) => b.points - a.points)
  const rank = new Map()
  for (const row of rows) { const n = (rank.get(row.position) ?? 0) + 1; rank.set(row.position, n); row.posRank = n }
  return { path: `historyPlayerSeasons/${SEASON}`, data: { season: SEASON, throughWeek, source: 'espn-weekly-scrape (season to date)', rows } }
}

async function writeFirestore(docs) {
  const token = execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim()
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  for (const d of docs) { // one doc per commit: each is ~50KB, far under the 10MB cap
    const body = { writes: [{ update: { name: `projects/${PROJECT}/databases/(default)/documents/${d.path}`, fields: Object.fromEntries(Object.entries(d.data).map(([k, v]) => [k, encodeValue(v)])) } }] }
    const res = await fetch(`${FS_BASE.replace('/documents', '')}/documents:commit`, { method: 'POST', headers, body: JSON.stringify(body) })
    if (!res.ok) throw new Error(`Firestore commit ${d.path}: ${res.status} ${await res.text()}`)
    const back = await fetch(`${FS_BASE}/${d.path}`, { headers }).then((r) => r.json())
    const n = back?.fields?.rows?.arrayValue?.values?.length ?? 0
    if (n !== d.data.rows.length) throw new Error(`Firestore read-back ${d.path}: ${n} rows, wrote ${d.data.rows.length}`)
    log(`firestore ${d.path}: ${n} rows verified`)
  }
}

// ── browser ───────────────────────────────────────────────────
async function openBrowser(headless) {
  let chromium
  try { ({ chromium } = await import('playwright')) } catch { ({ chromium } = await import('@playwright/test')) }
  return chromium.launchPersistentContext(PROFILE, { channel: 'chrome', headless, viewport: { width: 1400, height: 1000 } })
}
async function scrapeWeek(ctx, week) {
  const page = ctx.pages()[0] || await ctx.newPage()
  const pages = []
  for (let teamId = 1; teamId <= 12; teamId++) {
    const url = `https://fantasy.espn.com/football/team?leagueId=${LEAGUE}&seasonId=${SEASON}&teamId=${teamId}&scoringPeriodId=${week}&statSplit=singleScoringPeriod`
    let got
    for (let attempt = 1; attempt <= 3 && !got; attempt++) {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
        await page.waitForFunction((w) => /TOTALS/.test(document.body.innerText) && new RegExp(`NFL WEEK ${w}\\b`, 'i').test([...document.querySelectorAll('table thead')].map((t) => t.innerText).join(' ')) && document.querySelectorAll('table tbody tr').length > 15, week, { timeout: 45000 })
        await page.waitForTimeout(1500)
        got = await page.evaluate(extractClubhouse)
      } catch (e) {
        const body = await page.evaluate(() => document.body.innerText.slice(0, 400)).catch(() => '')
        if (/log ?in|sign ?in/i.test(body) && !/TOTALS/.test(body)) throw new Error('ESPN session looks logged out — run: node scripts/scrape-espn-week.mjs --login')
        if (attempt === 3) throw new Error(`team ${teamId} week ${week}: ${e.message}`)
      }
    }
    pages.push({ teamId, ...got })
  }
  await page.goto(`https://fantasy.espn.com/football/league/scoreboard?leagueId=${LEAGUE}&seasonId=${SEASON}&matchupPeriodId=${week}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForFunction(() => (document.body.innerText.match(/\(\d+-\d+-\d+, \d+\w\w\)/g) || []).length >= 12, null, { timeout: 45000 })
  await page.waitForTimeout(1500)
  const games = await page.evaluate(extractScoreboard)
  return { pages, games }
}

// ── main ──────────────────────────────────────────────────────
async function main() {
  mkdirSync(OUT, { recursive: true })
  if (flag('--login')) {
    const ctx = await openBrowser(false)
    const page = ctx.pages()[0] || await ctx.newPage()
    await page.goto(`https://fantasy.espn.com/football/team?leagueId=${LEAGUE}&seasonId=${SEASON}&teamId=10`)
    console.log('Sign in to ESPN in the Chrome window, confirm your team page shows, then press Enter here.')
    // macOS keeps Chrome running after its window closes, so wait for Enter (or a real quit).
    // Remember whether the team page loaded while it is still open — closing the
    // window (page 'close') is the usual way out, Enter in Terminal also works.
    let ok = false
    const probe = setInterval(async () => { ok = ok || await page.evaluate(() => /TOTALS/.test(document.body.innerText)).catch(() => false) }, 2000)
    await new Promise((r) => { ctx.on('close', r); page.on('close', r); process.stdin.resume(); process.stdin.once('data', r) })
    clearInterval(probe)
    process.stdin.pause()
    ok = ok || await page.evaluate(() => /TOTALS/.test(document.body.innerText)).catch(() => false)
    await ctx.close().catch(() => {})
    console.log(ok ? 'Login saved — team page was visible.' : 'Warning: team page was not visible; run --login again if the next step says logged out.')
    return
  }
  const ref = loadReference()
  const weeks = weeksToRun()
  if (weeks.some((w) => w < 1 || w > 18 || w > lastFinishedWeek())) throw new Error(`refusing week(s) ${weeks.join(',')}: last finished week is ${lastFinishedWeek()}`)
  log(`season ${SEASON} week(s) ${weeks.join(',')}${dryRun ? ' (dry run)' : ''}`)

  let scraped
  if (opt('--from-json')) scraped = JSON.parse(readFileSync(opt('--from-json'), 'utf8'))
  else {
    const ctx = await openBrowser(!flag('--headed'))
    try {
      scraped = {}
      for (const w of weeks) { scraped[w] = await scrapeWeek(ctx, w); log(`week ${w}: 12 pages + scoreboard loaded`) }
    } finally { await ctx.close() }
    writeFileSync(join(OUT, `espn-scrape-${SEASON}-wk${weeks.join('_')}.json`), JSON.stringify(scraped))
  }

  const built = weeks.map((w) => buildWeek(w, scraped[w].pages, scraped[w].games, ref))
  let bad = false
  for (const b of built) {
    for (const w of b.warnings) log(`warn wk${b.week}: ${w}`)
    for (const e of b.errors) { log(`FAIL wk${b.week}: ${e}`); bad = true }
    log(`week ${b.week}: ${b.playerRows.length} player rows (${b.playerRows.filter((r) => r.status === 'Starter').length} starters), ${b.teamRows.length} team rows, ${b.warnings.length} warnings, ${b.errors.length} errors`)
  }
  if (bad) throw new Error('validation failed — nothing written')
  if (dryRun) {
    const prev = join(OUT, `espn-preview-${SEASON}-wk${weeks.join('_')}.csv`)
    writeFileSync(prev, [ref.header.join(','), ...built.flatMap((b) => toCsvLines(ref, b))].join('\n') + '\n')
    log(`dry run: preview written to ${prev}; CSV and Firestore untouched`)
    return
  }
  const c = writeCsv(ref, built)
  log(`csv: ${c.before} → ${c.after} lines (+${c.added} written, ${c.replaced} replaced)`)
  if (flag('--no-firestore')) log('firestore skipped (--no-firestore)')
  else {
    const csvNow = readFileSync(CSV, 'utf8').split(/\r?\n/).filter(Boolean)
    await writeFirestore([...built.map((b) => toFirestoreDoc(ref, b)), toSeasonDoc(ref, csvNow)])
  }
  log('done')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { log(`ERROR ${e.message}`); process.exit(1) })
}
