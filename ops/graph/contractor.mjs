#!/usr/bin/env node
// contractor — you say what you want; it hires a crew to build it.
//
//   node ops/graph/contractor.mjs build "what you want changed"
//   node ops/graph/contractor.mjs plan  "what you want changed"   architect only: who WOULD be hired
//   node ops/graph/contractor.mjs build                           pick up a planned or stopped build
//   node ops/graph/contractor.mjs build --no-pr "…"               build, but stop before the pull request
//   node ops/graph/contractor.mjs status
//   node ops/graph/contractor.mjs reset                           shelve the current build (nothing is deleted)
//
// It writes no app code. It HIRES — each hire is a headless Claude Code
// session with a written brief — and it trusts none of them:
//
//   contractor  (this file — the only hand-written part)
//     ├─ architect   reads the app and your request; writes the blueprint =
//     │              the list of trades, each with its own brief. An agent
//     │              defining other agents.
//     ├─ trades      one per blueprint entry, in order, in one private
//     │   │          checkout. Each works in ONE area (web, functions,
//     │   │          scripts, rules, docs) and sees the work before it.
//     │   └─ helpers the architect may mark one big trade a LEAD. A lead
//     │              splits its job and writes briefs for 1-2 helpers of
//     │              its own, then joins their work. A helper hires no one.
//     └─ inspector   a different, stronger model reads the finished change
//                    and names what is wrong; those trades get one fix.
//
// What the contractor itself does: hire · check · commit · record · stop.
//   check    every answer is judged by code (ops/contractor/checks.mjs):
//            the blueprint's shape and size, each trade's files against its
//            area, then that area's tests. Finally the whole change, the
//            full test suite and the production build.
//   retry    a hire that fails its check gets ONE more try, shown why.
//   stop     a second failure stops the build. `build` again resumes there.
//   cap      6 trades and helpers at most — 8 hires in all.
//   end      a pull request labelled `contractor`. It never merges and
//            never deploys; if the inspector still lists problems the pull
//            request is opened as a DRAFT with them at the top.
//
// This is the builder lab's contractor (~/claude-agents/agent-builder-lab)
// pointed at a real app. The lab seals each hire in its own folder and
// glues one-file parts together; a real app cannot be built from one-file
// parts, so here the seal is a private git worktree plus the code checks,
// and the glue is git. The scouts (scouts.mjs) decide for themselves what
// to build; the contractor builds what you ask.
//
// Hand-run. No schedule, no secrets, nothing registered.
import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { claude, models } from './scouts.mjs'
import { parseGitDiff } from '../scouts/policy.mjs'
import { AREAS, MAX_HIRES, blueprintProblems, diffProblems, finalTests, flags, planProblems, reportProblems, slug } from '../contractor/checks.mjs'
import * as briefs from '../contractor/briefs.mjs'
import { treeHtml } from '../contractor/tree.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../..')
const MIN = 60 * 1000

export class Stop extends Error {}

// ── what each kind of hire is allowed ──────────────────────────
const READ = ['Read', 'Grep', 'Glob']
const KINDS = {
  architect: { tier: 'author', edits: false, tools: READ, budget: 4, mins: 20 },
  plan: { tier: 'author', edits: false, tools: READ, budget: 3, mins: 15 },
  trade: {
    tier: 'author', edits: true, budget: 8, mins: 40,
    tools: [...READ, 'Edit', 'Write', 'Bash'],
    allowed: ['Bash(npm --prefix web test:*)', 'Bash(npm --prefix web run build:*)', 'Bash(node --test:*)', 'Bash(git diff:*)', 'Bash(git status:*)', 'Bash(ls:*)'],
  },
  // Not the author's tier: a model grading its own output is a spell-check.
  inspector: { tier: 'reviewer', edits: false, tools: READ, budget: 4, mins: 20 },
}

/** One headless Claude Code session. Returns {out, cost}. */
export async function hireClaude({ kind, prompt, cwd, schema }) {
  const k = KINDS[kind]
  return claude(prompt, cwd, { model: models()[k.tier], schema, edits: k.edits, tools: k.tools, allowed: k.allowed ?? [], budget: k.budget }, k.mins * MIN)
}

/** Why the crew cannot be hired, from `claude auth status` — or null. The sign-in expires now and then. */
export function loginProblem(stdout) {
  try { if (JSON.parse(stdout).loggedIn === true) return null } catch { /* unreadable = not signed in */ }
  return 'Claude Code is signed out on this Mac — run `claude auth login` in Terminal, then `build` again'
}

// ── the checkout: a private worktree, never the one the Mac's jobs run from ──
export function gitRepo(root = ROOT) {
  const run = (cmd, args, cwd = root, extra = {}) =>
    execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024, ...extra }).trim()
  const git = (cwd, ...a) => run('git', a, cwd)
  const work = join(root, 'out/contractor-work')
  const failed = (label, e) => `${label} failed:\n${String((e.stdout ?? '') + (e.stderr ?? '')).split('\n').filter((l) => /not ok|error|Error|fail/i.test(l)).slice(0, 30).join('\n')}`
  const TESTS = {
    'web-test': (wt) => run('npm', ['--prefix', 'web', 'test'], wt, { timeout: 10 * MIN }),
    'web-build': (wt) => run('npm', ['--prefix', 'web', 'run', 'build'], wt, { timeout: 10 * MIN }),
    'functions-test': (wt) => run('node', ['--test', ...readdirSync(join(wt, 'functions')).filter((f) => f.endsWith('.test.js'))], join(wt, 'functions'), { timeout: 10 * MIN }),
  }
  return {
    preflight() {
      // Without this a signed-out Mac spends the architect's two tries finding out.
      let status = ''
      try { status = run('claude', ['auth', 'status'], root, { env: Object.fromEntries(Object.entries(process.env).filter(([k]) => !['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'].includes(k))) }) } catch (e) { status = String(e.stdout ?? '') }
      const signedOut = loginProblem(status)
      if (signedOut) throw new Stop(signedOut)
      run('gh', ['auth', 'status'])
      git(root, 'fetch', '-q', 'origin', 'main')
      try { run('gh', ['label', 'create', 'contractor', '--force', '--color', '0E8A16', '--description', "Built by the contractor's crew from a request"]) } catch { /* a nicety */ }
    },
    open(id, existing) {
      if (existing && existsSync(existing.path)) return existing
      // A build that had a checkout and lost it cannot resume: its trades' commits went with it.
      if (existing) throw new Error(`the checkout ${existing.path} is gone — run \`reset\`, then build again`)
      const path = join(work, id)
      const branch = `contractor/${id}`
      mkdirSync(work, { recursive: true })
      git(root, 'worktree', 'add', '-q', '-B', branch, path, 'origin/main')
      // Tests and the build need the installed packages; share them rather than reinstalling.
      for (const pkg of ['web', 'functions']) if (existsSync(join(root, pkg, 'node_modules'))) symlinkSync(join(root, pkg, 'node_modules'), join(path, pkg, 'node_modules'))
      const exclude = join(resolve(path, git(path, 'rev-parse', '--git-common-dir')), 'info/exclude')
      const have = existsSync(exclude) ? readFileSync(exclude, 'utf8').split('\n') : []
      for (const line of ['.contractor/', 'web/node_modules', 'functions/node_modules']) if (!have.includes(line)) appendFileSync(exclude, `\n${line}\n`)
      mkdirSync(join(path, '.contractor'), { recursive: true })
      return { path, branch, base: git(path, 'rev-parse', 'HEAD') }
    },
    put(wt, name, text) { writeFileSync(join(wt.path, '.contractor', name), text) },
    /** Files changed since `from` (default: since the last trade's commit). */
    diff(wt, from = 'HEAD') {
      git(wt.path, 'add', '-A', '-N') // make new files visible to diff without staging content
      return parseGitDiff(git(wt.path, 'diff', '--numstat', from), git(wt.path, 'diff', '--name-status', from))
    },
    patch(wt) { return git(wt.path, 'diff', wt.base) },
    commit(wt, message) {
      git(wt.path, 'add', '-A')
      if (git(wt.path, 'status', '--porcelain')) git(wt.path, 'commit', '-q', '-m', `${message}\n\nCo-Authored-By: Claude <noreply@anthropic.com>`)
      return git(wt.path, 'rev-parse', 'HEAD')
    },
    /** Run the named tests. Returns why it failed, or null. */
    check(wt, kinds) {
      for (const k of kinds) { try { TESTS[k](wt.path) } catch (e) { return failed(k, e) } }
      return null
    },
    pr(wt, { title, body, draft }) {
      git(wt.path, 'push', '-q', '-u', 'origin', wt.branch)
      const url = run('gh', ['pr', 'create', '--base', 'main', '--head', wt.branch, '--title', title, '--body', body, '--label', 'contractor', ...(draft ? ['--draft'] : [])], wt.path).split('\n').at(-1)
      try { git(root, 'worktree', 'remove', '--force', wt.path) } catch { /* left in out/contractor-work to look at */ }
      return url
    },
  }
}

// ── the pull request, in plain English ─────────────────────────
export function prBody(state, files) {
  const bp = state.blueprint
  const agent = (id) => state.agents.find((a) => a.id === id)
  const crew = bp.trades.flatMap((t) => [
    `- **${t.name}** (${AREAS[t.area].label})${t.lead ? ' — a lead: it hired its own helpers' : ''}: ${agent(t.id)?.summary ?? ''}`,
    ...state.agents.filter((a) => a.leadId === t.id).map((h) => `  - *${h.name}*: ${h.summary ?? ''}`),
  ])
  const open = state.openProblems ?? []
  const look = [...flags(files), ...(state.risk ? [state.risk] : [])]
  const lines = files.reduce((n, f) => n + f.added + f.deleted, 0)
  return [
    ...(open.length ? ['> **Draft — the inspector still lists problems.** Read these before anything else:', ...open.map((p) => `> - ${p.trade}: ${p.problem}`), ''] : []),
    "Built by the **contractor's crew** (`ops/graph/contractor.mjs`) from this request:", '', `> ${state.request}`,
    '', '## What changes', bp.summary,
    '', '## How to check it', ...bp.acceptance.map((a) => `- [ ] ${a}`),
    ...(bp.needsYou?.length ? ['', '## Only you can do', ...bp.needsYou.map((n) => `- [ ] ${n}`)] : []),
    ...(look.length ? ['', '## Look at this before merging', ...look.map((l) => `- ${l}`)] : []),
    '', '## The crew', `- **Architect**: designed it and defined ${bp.trades.length} trade${bp.trades.length === 1 ? '' : 's'}`, ...crew,
    `- **Inspector** (a second, stronger model): ${open.length ? `still lists ${open.length} problem${open.length === 1 ? '' : 's'}` : 'passed it'}`,
    '', '## Automatic checks',
    `- Every trade stayed inside its area, and the whole change inside the limits: ${files.length} file${files.length === 1 ? '' : 's'}, ${lines} lines`,
    `- ${finalTests(files).map((t) => `\`${t}\``).join(', ')}: passed`,
    '', '🤖 Generated with [Claude Code](https://claude.com/claude-code)',
  ].join('\n')
}

// ── the contractor ─────────────────────────────────────────────
export class Contractor {
  /**
   * @param dir   where the record lives (out/contractor)
   * @param hire  async ({kind, prompt, cwd, schema}) => {out, cost}
   * @param repo  the checkout (gitRepo, or a fake in tests)
   * @param app   the paragraph about the app that opens every brief
   */
  constructor({ dir, hire = hireClaude, repo = gitRepo(), say = console.log, app = '', now = () => new Date() }) {
    Object.assign(this, { dir, hire, repo, say, app, now })
    this.buildDir = join(dir, 'build')
    this.stateFile = join(this.buildDir, 'state.json')
    this.state = null
  }

  // ── record ──
  save() {
    mkdirSync(this.buildDir, { recursive: true })
    writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2))
    writeFileSync(join(this.buildDir, 'tree.html'), treeHtml(this.state))
  }

  note(msg) {
    this.state.log.push(`${this.now().toTimeString().slice(0, 8)}  ${msg}`)
    this.say(`[contractor] ${msg}`)
    this.save()
  }

  agent(id) { return this.state.agents.find((a) => a.id === id) }

  enrol(id, role, name, madeBy, extra = {}) {
    let a = this.agent(id)
    if (!a) {
      if (this.state.agents.length >= MAX_HIRES) throw new Stop(`the cap of ${MAX_HIRES} hires is reached`)
      a = { id, role, name, madeBy, status: 'hired', tries: 0, cost: 0, secs: 0, ...extra }
      this.state.agents.push(a)
    }
    return a
  }

  // ── hire + check + one retry ──
  async work(a, { kind, schema, brief, check, mode = 'work' }) {
    const doing = { work: 'at work', plan: 'deciding which helpers to hire', join: "joining its helpers' work", fix: 'fixing its part' }[mode]
    const folder = join(this.buildDir, 'crew', a.id)
    mkdirSync(folder, { recursive: true })
    let problems = []
    for (const attempt of [1, 2]) {
      const prompt = brief(problems.length ? briefs.rejected(problems) : '')
      writeFileSync(join(folder, mode === 'plan' ? 'brief-plan.md' : 'brief.md'), prompt)
      a.status = mode === 'fix' ? 'fixing' : attempt === 2 ? 'retry' : 'working'
      a.tries += 1
      delete a.note
      this.note(`${a.name}: ${doing} (try ${attempt})`)
      const started = Date.now()
      let got
      try {
        got = await this.hire({ kind, prompt, cwd: this.state.worktree.path, schema })
        a.cost = Math.round((a.cost + (got.cost ?? 0)) * 10000) / 10000
        problems = await check(got.out)
      } catch (e) {
        problems = [`the session did not finish: ${String(e.message ?? e).slice(0, 200)}`]
      }
      a.secs += Math.round((Date.now() - started) / 1000)
      if (!problems.length) {
        a.status = 'passed'
        this.note(`${a.name}: passed its check`)
        return got.out
      }
      a.note = problems.join('; ')
      this.note(`${a.name}: REJECTED — ${a.note.slice(0, 200)}`)
    }
    a.status = 'failed'
    this.save()
    throw new Stop(`${a.name} failed its check twice: ${problems.join('; ').slice(0, 240)}`)
  }

  // ── the steps ──
  async architect() {
    const s = this.state
    const a = this.enrol('architect', 'architect', 'Architect', 'contractor', { job: 'Designs the change and decides which trades are needed.' })
    if (a.status === 'passed' && s.blueprint) return s.blueprint
    const bp = await this.work(a, {
      kind: 'architect', schema: briefs.SCHEMAS.blueprint,
      brief: (extra) => `${briefs.architect({ app: this.app, request: s.request })}${extra ? `\n\n${extra}` : ''}`,
      check: (out) => blueprintProblems(out),
    })
    s.blueprint = bp
    if (bp.buildable === false) return bp
    s.title = bp.title
    for (const t of bp.trades) this.enrol(t.id, 'trade', t.name, 'architect', { job: t.job, area: t.area, lead: Boolean(t.lead) })
    this.note(`Blueprint: ${bp.title} — ${bp.trades.length} trade(s): ${bp.trades.map((t) => t.id).join(', ')}`)
    return bp
  }

  /** The check every trade and helper answers to: stayed in its area, then that area's tests. */
  tradeCheck(area, allowEmpty = false) {
    const wt = this.state.worktree
    return async (out) => {
      if (!out?.done) return [`it stopped without finishing: ${String(out?.notes || out?.summary || 'no reason given').slice(0, 300)}`]
      const bad = diffProblems(await this.repo.diff(wt), area, { allowEmpty })
      if (bad.length) return bad
      const why = await this.repo.check(wt, AREAS[area].tests)
      return why ? [why] : []
    }
  }

  async keep(a, out) {
    a.summary = out.summary ?? ''
    a.sha = await this.repo.commit(this.state.worktree, `[${a.id}] ${a.name}`)
    this.save()
  }

  /** A lead trade hires its own helpers. */
  async helpers(t, a) {
    if (!a.plan) {
      const taken = new Set(this.state.agents.map((x) => x.id))
      const plan = await this.work(a, {
        kind: 'plan', schema: briefs.SCHEMAS.plan, mode: 'plan',
        brief: (extra) => `${briefs.leadPlan({ app: this.app, t })}${extra ? `\n\n${extra}` : ''}`,
        check: (out) => planProblems(out, taken, t.id),
      })
      a.plan = plan.helpers
      a.glue = String(plan.glue ?? '')
      this.note(`${a.name} asked for ${a.plan.length} helper(s): ${a.plan.map((h) => h.id).join(', ')}`)
    }
    a.status = 'leading'
    this.save()
    for (const h of a.plan) {
      const ha = this.enrol(`${t.id}-${h.id}`, 'helper', h.name, `${t.id} trade`, { job: h.job, area: t.area, leadId: t.id })
      if (ha.status === 'passed' && ha.sha) continue
      const out = await this.work(ha, {
        kind: 'trade', schema: briefs.SCHEMAS.trade,
        brief: (extra) => briefs.helper({ app: this.app, t, h, glue: a.glue, note: extra }),
        check: this.tradeCheck(t.area),
      })
      await this.keep(ha, out)
    }
    return a.plan.map((h) => `${t.id}-${h.id}`)
  }

  async trade(t, fix = '') {
    const a = this.agent(t.id)
    if (a.status === 'passed' && a.sha && !fix) return
    let note = fix ? briefs.fixNote(fix) : ''
    let mode = fix ? 'fix' : 'work'
    if (t.lead && !fix) {
      note = briefs.joinNote(await this.helpers(t, a))
      mode = 'join'
    }
    const out = await this.work(a, {
      kind: 'trade', schema: briefs.SCHEMAS.trade, mode,
      brief: (extra) => briefs.trade({ app: this.app, t, note: [note, extra].filter(Boolean).join('\n\n') }),
      // A lead whose helpers did everything has nothing left to change — that is allowed.
      check: this.tradeCheck(t.area, mode === 'join'),
    })
    await this.keep(a, out)
  }

  /** The whole change against the limits, the full suite and the build. One repair, then stop. */
  async wholeCheck(bp) {
    const wt = this.state.worktree
    for (const round of [1, 2]) {
      const files = await this.repo.diff(wt, wt.base)
      const bad = diffProblems(files, null)
      const why = bad.length ? bad.join('\n') : await this.repo.check(wt, finalTests(files))
      if (!why) return files
      this.note(`The finished build fails its checks: ${why.split('\n')[0]}`)
      if (round === 2) throw new Stop(`the finished build still fails its checks: ${why.slice(0, 240)}`)
      // The build is the browser app's, so its last trade is the likeliest owner; failing that, the last trade.
      const owner = [...bp.trades].reverse().find((t) => t.area === (why.startsWith('functions') ? 'functions' : 'web')) ?? bp.trades.at(-1)
      await this.trade(owner, `The parts passed alone but the whole build does not:\n\n${why}`)
    }
  }

  async inspect(bp) {
    const s = this.state
    const a = this.enrol('inspector', 'inspector', 'Inspector', 'contractor', { job: 'Reads the finished change and lists anything that would break it.' })
    await this.repo.put(s.worktree, 'diff.patch', await this.repo.patch(s.worktree))
    a.status = 'hired'
    const ids = new Set(bp.trades.map((t) => t.id))
    return this.work(a, {
      kind: 'inspector', schema: briefs.SCHEMAS.report,
      brief: (extra) => `${briefs.inspector({ app: this.app, request: s.request })}${extra ? `\n\n${extra}` : ''}`,
      check: (out) => reportProblems(out, ids),
    })
  }

  // ── build ──
  async build(request, { noPr = false, planOnly = false } = {}) {
    const prev = existsSync(this.stateFile) ? JSON.parse(readFileSync(this.stateFile, 'utf8')) : null
    if (prev && request && request !== prev.request) {
      if (!['done', 'declined', 'planned'].includes(prev.status)) {
        this.say(`[contractor] a different build is unfinished ("${prev.request.slice(0, 60)}") — run \`build\` with no request to finish it, or \`reset\` to shelve it`)
        return 1
      }
      this.reset()
    } else if (prev) {
      this.state = prev
      if (prev.status === 'done') {
        this.say(`[contractor] already built — ${prev.pr?.url ?? prev.worktree?.path}`)
        return 0
      }
      if (prev.status === 'declined') {
        this.say(`[contractor] the architect said this cannot be built: ${prev.blueprint?.reason}`)
        return 1
      }
    }
    if (!this.state && !request) {
      this.say('[contractor] nothing to pick up — say what you want: build "…"')
      return 2
    }
    if (this.state) {
      this.state.status = 'building'
      this.note('Picking up where the last run stopped')
    } else {
      const at = this.now().toISOString().replace(/[-:]/g, '').slice(0, 13).replace('T', '-')
      this.state = { id: `${slug(request)}-${at}`, request, status: 'building', title: '', agents: [], log: [], inspections: 0, openProblems: null }
      this.note(`Contractor started. You asked for: ${request}`)
    }
    const s = this.state
    try {
      await this.repo.preflight()
      s.worktree = await this.repo.open(s.id, s.worktree)
      const bp = await this.architect()
      if (bp.buildable === false) {
        s.status = 'declined'
        this.note(`The architect says this cannot be built as asked: ${bp.reason}`)
        return 1
      }
      await this.repo.put(s.worktree, 'blueprint.json', JSON.stringify(bp, null, 2))
      if (planOnly) {
        s.status = 'planned'
        this.note('Planned only. Run `build` with no request to hire the trades.')
        return 0
      }
      for (const t of bp.trades) await this.trade(t)
      let files = await this.wholeCheck(bp)
      while (s.openProblems == null || (s.openProblems.length && s.inspections < 2)) {
        s.inspections += 1
        const rep = await this.inspect(bp)
        s.risk = rep.risk ?? ''
        s.openProblems = rep.pass ? [] : rep.problems.slice(0, 3)
        if (!s.openProblems.length) { this.note('Inspector: it passes'); break }
        this.note(`Inspector found ${s.openProblems.length} problem(s): ${s.openProblems.map((p) => `${p.trade} — ${p.problem.slice(0, 90)}`).join('; ')}`)
        if (s.inspections >= 2) break
        for (const p of s.openProblems) await this.trade(bp.trades.find((t) => t.id === p.trade), p.problem)
        files = await this.wholeCheck(bp)
      }
      if (noPr) {
        s.status = 'done'
        this.note(`Done, held before the pull request (--no-pr). The work is in ${s.worktree.path}`)
        return 0
      }
      const draft = s.openProblems.length > 0
      s.pr = { url: await this.repo.pr(s.worktree, { title: bp.title, body: prBody(s, files), draft }), draft }
      s.status = 'done'
      this.note(`Done. ${draft ? 'DRAFT pull request (the inspector still lists problems)' : 'Pull request'}: ${s.pr.url}`)
      return 0
    } catch (e) {
      if (!(e instanceof Stop)) e.message = `something broke outside the crew — ${e.message}`
      s.status = 'stopped'
      this.note(`STOPPED: ${e.message}. Run \`build\` again to pick up here, or \`reset\` to shelve it.`)
      return 1
    }
  }

  status() {
    if (!existsSync(this.stateFile)) { this.say('[contractor] nothing has been built — run: build "what you want"'); return 0 }
    const s = JSON.parse(readFileSync(this.stateFile, 'utf8'))
    this.say(`[contractor] ${s.status} — ${s.title || s.request.slice(0, 70)}`)
    for (const a of s.agents) this.say(`  ${a.role.padEnd(10)} ${a.name.slice(0, 38).padEnd(38)} ${a.status.padEnd(8)} tries=${a.tries} $${a.cost.toFixed(2)}${a.note ? `  ${a.note.slice(0, 70)}` : ''}`)
    if (s.pr?.url) this.say(`  pull request: ${s.pr.url}`)
    this.say(`  page: ${join(this.buildDir, 'tree.html')}`)
    return 0
  }

  /** Nothing is deleted: the record moves to <dir>/archive/<id>/. The checkout and branch stay. */
  reset() {
    if (!existsSync(this.buildDir)) { this.say('[contractor] nothing to shelve'); return 0 }
    let id = 'build'
    try { id = JSON.parse(readFileSync(this.stateFile, 'utf8')).id } catch { /* unreadable = unnamed */ }
    let dest = join(this.dir, 'archive', id)
    for (let n = 2; existsSync(dest); n++) dest = join(this.dir, 'archive', `${id}-${n}`)
    mkdirSync(dirname(dest), { recursive: true })
    renameSync(this.buildDir, dest)
    this.state = null
    this.say(`[contractor] shelved the last build in ${dest}`)
    return 0
  }
}

function notify(text) {
  try { execFileSync('/usr/bin/osascript', ['-e', `display notification ${JSON.stringify(text)} with title "IFFL contractor"`], { stdio: 'ignore' }) } catch { /* never fail on a notification */ }
}

async function main(argv) {
  const [cmd, ...rest] = argv
  if (!['build', 'plan', 'status', 'reset'].includes(cmd)) {
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 9).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'))
    return 2
  }
  const c = new Contractor({ dir: join(ROOT, 'out/contractor'), app: readFileSync(join(ROOT, 'ops/scouts/prompts/_shared.md'), 'utf8').trim() })
  if (cmd === 'status') return c.status()
  if (cmd === 'reset') return c.reset()
  const request = rest.filter((a) => !a.startsWith('--')).join(' ').trim() || null
  console.log(`[contractor] watch it: open ${join(ROOT, 'out/contractor/build/tree.html')}`)
  const code = await c.build(request, { noPr: rest.includes('--no-pr'), planOnly: cmd === 'plan' })
  const s = c.state
  if (s) notify(s.status === 'done' ? (s.pr?.url ? `Pull request ready: ${s.title}` : `Built and held: ${s.title}`) : s.status === 'planned' ? `Planned: ${s.title}` : `Stopped — ${s.log.at(-1)?.slice(10, 150)}`)
  return code
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error(`[contractor] FAILED — ${e.message}`); process.exit(1) })
}
