// answer — the contractor's ANSWER mode. You ask a question about the
// league; a crew works it out; you get a private report on this Mac.
//
//   node ops/graph/contractor.mjs ask "who is the best keeper value from 2026"
//
//   contractor
//     ├─ analyst     decides HOW to answer, from the commissioner's
//     │              definitions and the real data. If a term is not
//     │              defined it stops and asks — it never picks a meaning.
//     ├─ calculator  writes calc.mjs. The CONTRACTOR runs it, sealed (no
//     │              network, no writes, no reads outside its folder), and
//     │              takes every number from what it prints.
//     ├─ checker     a different, stronger model reads the calculation and
//     │              its output and names what is wrong; one fix round.
//     └─ writer      a headline and a few paragraphs. A digit in the words
//                    that the calculation did not print throws them away,
//                    and the report shows the numbers alone.
//
// It reads the committed league files plus ONE thing from the live
// database: today's rosters and prices (`players`), fetched by this code
// with the Mac's gcloud login and handed to the crew as a file. The crew
// holds no login and cannot reach the database. Nothing is ever written
// to it, and nothing here touches the repo — reports live in
// out/contractor/answers/, which git ignores.
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as A from '../contractor/answer.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const PROJECT = 'iffl-auth'
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`
const DATA = /\.(csv|json|md)$/
const NOT_DATA = /^big-board/ // the commissioner's private keep/drop calls never reach a crew

export class Stop extends Error {}

/** Today's rosters and prices, read-only. Throws if the gcloud login is gone. */
export async function fetchPlayers() {
  const token = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  const players = []
  let page = ''
  do {
    const res = await fetch(`${FS_BASE}/players?pageSize=300${page ? `&pageToken=${page}` : ''}`, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) throw new Error(`Firestore answered ${res.status}`)
    const body = await res.json()
    players.push(...(body.documents ?? []).map(A.trimPlayer))
    page = body.nextPageToken ?? ''
  } while (page)
  if (!players.length) throw new Error('the players collection came back empty')
  return players
}

/** macOS sandbox for the calculation: no network, no writes, no reading the Mac beyond its own folder and Node itself. */
export function sealProfile(folder, home = process.env.HOME, node = resolve(process.execPath, '../..')) {
  return `(version 1)(allow default)(deny network*)(deny file-write*)(allow file-write* (literal "/dev/null"))(deny file-read* (subpath "${home}"))(allow file-read* (subpath "${folder}") (subpath "${node}"))`
}

/** Everything that touches the disk, the database or a process — faked in tests. */
export function realDesk(root = ROOT) {
  return {
    preflight() {
      let status = ''
      try { status = execFileSync('claude', ['auth', 'status'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env: Object.fromEntries(Object.entries(process.env).filter(([k]) => !['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'].includes(k))) }) } catch (e) { status = String(e.stdout ?? '') }
      let ok = false
      try { ok = JSON.parse(status).loggedIn === true } catch { /* unreadable = signed out */ }
      if (!ok) throw new Stop('Claude Code is signed out on this Mac — run `claude auth login` in Terminal, then ask again')
    },
    /** A fresh folder holding copies of the league files and today's rosters. */
    async open(folder) {
      mkdirSync(join(folder, 'data'), { recursive: true })
      for (const f of readdirSync(join(root, 'data'))) if (DATA.test(f) && !NOT_DATA.test(f)) copyFileSync(join(root, 'data', f), join(folder, 'data', f))
      copyFileSync(join(root, 'ops/contractor/definitions.md'), join(folder, 'definitions.md'))
      try {
        const players = await fetchPlayers()
        writeFileSync(join(folder, 'players.json'), JSON.stringify(players))
        return { at: new Date().toISOString(), count: players.length }
      } catch (e) {
        return { missing: String(e.message ?? e).slice(0, 160) }
      }
    },
    files(folder) { return readdirSync(folder).filter((f) => f !== 'data') },
    read(folder, name) { return existsSync(join(folder, name)) ? readFileSync(join(folder, name), 'utf8') : '' },
    write(folder, name, text) { mkdirSync(folder, { recursive: true }); writeFileSync(join(folder, name), text) },
    /** Run calc.mjs sealed; returns what it printed. */
    run(folder) {
      const real = execFileSync('/bin/pwd', ['-P'], { cwd: folder, encoding: 'utf8' }).trim()
      return execFileSync('/usr/bin/sandbox-exec', ['-p', sealProfile(real), process.execPath, 'calc.mjs'], { cwd: real, encoding: 'utf8', timeout: 90 * 1000, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: '/usr/bin:/bin' } })
    },
    show(path) { try { execFileSync('/usr/bin/open', [path], { stdio: 'ignore' }) } catch { /* the path is printed anyway */ } },
  }
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'question'

export class Answers {
  /**
   * @param dir   where answers live (out/contractor/answers)
   * @param hire  async ({kind, prompt, cwd, schema}) => {out, cost}
   * @param desk  disk, database and sandbox (realDesk, or a fake in tests)
   */
  constructor({ dir, hire, desk = realDesk(), say = console.log, now = () => new Date() }) {
    Object.assign(this, { dir, hire, desk, say, now })
    this.state = null
  }

  save() {
    const s = this.state
    this.desk.write(s.folder, 'state.json', JSON.stringify(s, null, 2))
    this.desk.write(s.folder, 'report.html', A.reportHtml(s))
  }

  note(msg) {
    this.state.log.push(`${this.now().toTimeString().slice(0, 8)}  ${msg}`)
    this.say(`[contractor] ${msg}`)
    this.save()
  }

  /** Hire, check by code, one retry shown why, then stop. */
  async work(id, name, { kind, schema, brief, check }) {
    const s = this.state
    let a = s.agents.find((x) => x.id === id)
    if (!a) s.agents.push(a = { id, name, status: 'hired', tries: 0, cost: 0 })
    let problems = []
    for (const attempt of [1, 2]) {
      const prompt = brief(problems.length ? A.rejected(problems) : '')
      this.desk.write(join(s.folder, 'crew'), `${id}-brief.md`, prompt)
      a.tries += 1
      a.status = 'working'
      this.note(`${name}: at work (try ${attempt})`)
      let got
      try {
        got = await this.hire({ kind, prompt, cwd: s.folder, schema })
        a.cost = Math.round((a.cost + (got.cost ?? 0)) * 10000) / 10000
        problems = await check(got.out)
      } catch (e) {
        problems = [`the session did not finish: ${String(e.message ?? e).slice(0, 200)}`]
      }
      if (!problems.length) { a.status = 'passed'; this.note(`${name}: passed its check`); return got.out }
      a.note = problems.join('; ')
      this.note(`${name}: REJECTED — ${a.note.slice(0, 200)}`)
    }
    a.status = 'failed'
    throw new Stop(`${name} failed its check twice: ${problems.join('; ').slice(0, 240)}`)
  }

  /** The calculator's check: it wrote only calc.mjs, the text is allowed, and it runs sealed to a usable result. */
  calcCheck(before) {
    const s = this.state
    return async (out) => {
      if (!out?.done) return [`it stopped without finishing: ${String(out?.notes || out?.summary || 'no reason given').slice(0, 300)}`]
      const extra = this.desk.files(s.folder).filter((f) => !before.has(f) && f !== 'calc.mjs')
      if (extra.length) return [`write calc.mjs and nothing else — you also created ${extra.join(', ')}`]
      const bad = A.calcProblems(this.desk.read(s.folder, 'calc.mjs'))
      if (bad.length) return bad
      let printed
      try { printed = await this.desk.run(s.folder) } catch (e) { return [`calc.mjs did not run: ${String(e.stderr || e.message || e).trim().split('\n').slice(-4).join(' ').slice(0, 300)}`] }
      let result
      try { result = JSON.parse(printed) } catch { return [`calc.mjs must print one JSON object and nothing else — it printed: ${String(printed).slice(0, 120)}`] }
      const wrong = A.resultProblems(result)
      if (wrong.length) return wrong
      s.result = result
      this.desk.write(s.folder, 'result.json', JSON.stringify(result, null, 2))
      return []
    }
  }

  async calculate(note = '') {
    const s = this.state
    const before = new Set([...this.desk.files(s.folder), 'result.json'])
    const out = await this.work('calculator', 'Calculator', {
      kind: 'calculator', schema: A.SCHEMAS.calc,
      brief: (extra) => A.calculator({ question: s.question, plan: s.plan, snapshot: s.snapshot, note: [note, extra].filter(Boolean).join('\n\n') }),
      check: this.calcCheck(before),
    })
    s.calcSummary = out.summary ?? ''
  }

  async ask(question) {
    if (!question) { this.say('[contractor] ask what? — ask "your question"'); return 2 }
    const at = this.now().toISOString().replace(/[-:]/g, '').slice(0, 13).replace('T', '-')
    const id = `${slug(question)}-${at}`
    const s = this.state = { id, question, status: 'asking', folder: join(this.dir, id), agents: [], log: [], snapshot: null, plan: null, result: null, words: null, openProblems: null }
    const report = join(s.folder, 'report.html')
    try {
      await this.desk.preflight()
      const snap = await this.desk.open(s.folder)
      s.snapshot = snap.missing ? null : snap
      this.note(`Contractor started. You asked: ${question}`)
      this.note(snap.missing ? `Today's rosters and prices could NOT be read (${snap.missing}) — answering from the league files alone` : `Read today's rosters and prices: ${snap.count} players`)

      s.plan = await this.work('analyst', 'Analyst', {
        kind: 'analyst', schema: A.SCHEMAS.method,
        brief: (extra) => A.analyst({ question, snapshot: s.snapshot, note: extra }),
        check: (out) => A.methodProblems(out),
      })
      if (!s.plan.answerable) {
        s.status = 'needs-you'
        this.note(`The analyst cannot answer this yet: ${s.plan.reason || s.plan.ask.join(' / ')}`)
        this.desk.show(report)
        return 1
      }
      this.note(`Method: ${s.plan.title}`)

      await this.calculate()
      for (const round of [1, 2]) {
        const rep = await this.work('checker', 'Checker', {
          kind: 'checker', schema: A.SCHEMAS.check,
          brief: (extra) => A.checker({ question, plan: s.plan, note: extra }),
          check: (out) => A.checkerProblems(out),
        })
        s.caveats = rep.caveats ?? []
        s.openProblems = rep.pass ? [] : rep.problems.slice(0, 4)
        if (!s.openProblems.length) { this.note('Checker: the calculation passes'); break }
        this.note(`Checker found ${s.openProblems.length} problem(s): ${s.openProblems.map((p) => p.slice(0, 90)).join('; ')}`)
        if (round === 2) break
        await this.calculate(`## A second, stronger model read your calculation and found it WRONG\n${s.openProblems.map((p) => `- ${p}`).join('\n')}\n\ncalc.mjs is still in this folder. Fix exactly these and leave the rest.`)
      }

      // Words are optional; numbers are not. A write-up that fails twice is dropped, not the answer.
      try {
        s.words = await this.work('writer', 'Writer', {
          kind: 'writer', schema: A.SCHEMAS.words,
          brief: (extra) => A.writer({ question, plan: s.plan, result: s.result, note: extra }),
          check: (out) => A.wordProblems(out, s.result, question),
        })
      } catch (e) {
        if (!(e instanceof Stop)) throw e
        s.words = null
        this.note('The write-up was dropped — the report shows the numbers alone')
      }
      s.status = 'done'
      this.note(`Done${s.openProblems.length ? ' — but the checker still has doubts; they lead the report' : ''}. Report: ${report}`)
      this.desk.show(report)
      return 0
    } catch (e) {
      if (!(e instanceof Stop)) e.message = `something broke outside the crew — ${e.message}`
      s.status = 'stopped'
      try { this.note(`STOPPED: ${e.message}`) } catch { this.say(`[contractor] STOPPED: ${e.message}`) }
      return 1
    }
  }
}

/** What `build --answer <id>` hands the build crew: the request, and the files to lay on its desk. */
export function answerForBuild(dir, id) {
  const folder = join(dir, id)
  if (!existsSync(join(folder, 'state.json'))) throw new Stop(`there is no answer called ${id} in ${dir}`)
  const s = JSON.parse(readFileSync(join(folder, 'state.json'), 'utf8'))
  if (s.status !== 'done') throw new Stop(`the answer ${id} never finished (${s.status}) — ask again first`)
  return {
    request: `Put this on the site for the whole league: "${s.question}" (${s.plan.title}). A checked calculation that answers it is in .contractor/calc.mjs and its plain-English method in .contractor/method.md. Rebuild it as a tested service and a page or section, reading the app's own data sources rather than the files calc.mjs read.`,
    attach: { 'calc.mjs': readFileSync(join(folder, 'calc.mjs'), 'utf8'), 'method.md': `# ${s.plan.title}\n\n${s.plan.method}\n\n${(s.plan.steps ?? []).map((x, i) => `${i + 1}. ${x}`).join('\n')}\n` },
  }
}
