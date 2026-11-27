#!/usr/bin/env node
// scouts — agents that propose and build improvements to the app, weekly.
//
// Three scouts each look at the app from one angle and may propose ONE
// change; a builder writes it; a reviewer on a different model judges it;
// and what survives becomes a pull request. Nothing merges or deploys here.
//
//   preflight ─┬─▶ capture ──────────────┐
//              ├─▶ history ──────────────┤
//              └─▶ worktree:S ───────────┴─▶ idea:S ─▶ build:S ─▶ review:S ─▶ pr:S ─┐
//                  (one chain per scout: visuals, usability, data — side by side)   ├─▶ digest
//
//   capture     screenshots + usability numbers from sample-data mode
//   history     past scout pull requests: merged = liked, closed = rejected
//   worktree:S  a private checkout of origin/main — the working copy your
//               scheduled jobs run from is never touched
//   idea:S      read-only Claude picks one idea, or none
//   build:S     Claude builds it; then THIS FILE checks the diff against
//               ops/scouts/policy.mjs and runs the tests and the build. One
//               repair round if they fail; still failing, it is dropped.
//   review:S    a different, stronger model approves or rejects
//   pr:S        commit, push, open a pull request labelled `scout`
//
// Bounds: one pull request per scout per week, none while that scout
// already has one open, browser-app files only, and you merge.
//
//   node ops/graph/scouts.mjs                 the weekly run
//   node ops/graph/scouts.mjs --plan          print the steps, run nothing
//   node ops/graph/scouts.mjs --only data     one scout
//   node ops/graph/scouts.mjs --no-pr         stop before pushing (keeps the checkout to inspect)
//   node ops/graph/scouts.mjs --fresh         ignore saved state
import { spawn, execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync, appendFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runGraph, levels } from './runner.mjs'
import { capture } from '../scouts/capture.mjs'
import { checkDiff, parseGitDiff } from '../scouts/policy.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../..')
const PROMPTS = join(ROOT, 'ops/scouts/prompts')
const WORK = join(ROOT, 'out/scout-work')
export const SCOUTS = ['visuals', 'usability', 'data']
const NEEDS_CAPTURE = new Set(['visuals', 'usability'])
const MIN = 60 * 1000

const stamp = () => new Date().toISOString().slice(0, 19)
const say = (line) => console.log(`${stamp()} ${line}`)
const today = () => new Date().toLocaleDateString('en-CA')
const run = (cmd, args, cwd = ROOT, extra = {}) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024, ...extra }).trim()
const git = (cwd, ...a) => run('git', a, cwd)

// ── models: tiers, never ids (estate House Rule 3) ─────────────
export function models(path = join(homedir(), 'claude-agents/_shared/estate/models.json')) {
  try {
    const m = JSON.parse(readFileSync(path, 'utf8'))
    const author = 'default'
    // The reviewer must not be the author's tier — a model grading its own
    // output is a spell-check.
    const reviewer = m.review_tier?.[author] ?? 'deep'
    return { author: m.tiers[author].id, reviewer: m.tiers[reviewer].id }
  } catch {
    return { author: 'sonnet', reviewer: 'opus' }
  }
}

// ── headless Claude Code, locked down the way the estate's fixer runs it ──
const NEVER = [
  'Read(**/secrets.env)', 'Read(**/.env)', 'Read(**/.env.*)', 'Read(**/*token*.json)', 'Read(**/credentials*.json)',
  'Edit(**/*.plist)', 'Write(**/*.plist)', 'Edit(**/.github/**)', 'Write(**/.github/**)',
  'Bash(git push:*)', 'Bash(git commit:*)', 'Bash(git checkout:*)', 'Bash(rm:*)',
]

export function claudeArgs({ model, schema, edits, tools, allowed = [], budget }) {
  return [
    '-p', '--output-format', 'json', '--no-session-persistence',
    '--restricted', '--strict-mcp-config', '--permission-prompts', 'none',
    '--permission-mode', edits ? 'acceptEdits' : 'dontAsk',
    '--json-schema', JSON.stringify(schema),
    '--max-budget-usd', budget.toFixed(2),
    '--tools', tools.join(','),
    '--model', model,
    ...(allowed.length ? ['--allowedTools', ...allowed] : []),
    '--disallowedTools', ...NEVER,
  ]
}

/** Pull the structured answer out of `claude -p --output-format json`. */
export function parseClaude(stdout) {
  const raw = String(stdout ?? '').trim()
  let data
  try { data = JSON.parse(raw.split('\n').at(-1)) } catch { throw new Error(`claude output was not JSON: ${raw.slice(0, 200)}`) }
  let out = data.structured_output
  if (out == null) {
    const m = /\{[\s\S]*\}/.exec(data.result ?? '')
    try { out = m ? JSON.parse(m[0]) : null } catch { out = null }
  }
  if (data.is_error || !out || typeof out !== 'object') throw new Error(`claude gave no usable answer: ${String(data.result ?? '').slice(0, 200)}`)
  return { out, cost: data.total_cost_usd ?? null }
}

export function claude(prompt, cwd, opts, timeoutMs) {
  return new Promise((done, fail) => {
    // No API key in the child: -p would prefer it over the subscription login and bill the API.
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'].includes(k)))
    const p = spawn('claude', claudeArgs(opts), { cwd, env })
    let out = '', err = ''
    const timer = setTimeout(() => { p.kill('SIGTERM'); fail(new Error(`claude ran past ${Math.round(timeoutMs / MIN)} min`)) }, timeoutMs)
    p.stdout.on('data', (b) => { out += b })
    p.stderr.on('data', (b) => { err += b })
    p.on('error', (e) => { clearTimeout(timer); fail(new Error(`could not start claude: ${e.message}`)) })
    p.on('close', () => { clearTimeout(timer); try { done(parseClaude(out)) } catch (e) { fail(new Error(`${e.message} ${err.slice(0, 200)}`)) } })
    p.stdin.end(prompt)
  })
}

// ── prompts ────────────────────────────────────────────────────
const prompt = (name) => readFileSync(join(PROMPTS, `${name}.md`), 'utf8')
const fill = (text, vars) => text.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '')

/** Past pull requests for one scout, as the "what you proposed before" section. */
export function historyText(prs) {
  const of = (state) => (prs ?? []).filter((p) => p.state === state).map((p) => `- ${p.title}`)
  const part = (label, list) => (list.length ? `${label}:\n${list.join('\n')}` : `${label}: none yet`)
  return [
    part('MERGED (the commissioner wanted these)', of('MERGED')),
    part('CLOSED WITHOUT MERGING (he did not)', of('CLOSED')),
    part('STILL OPEN', of('OPEN')),
  ].join('\n\n')
}

export function ideaText(idea) {
  return [`**${idea.title}**`, '', `Problem: ${idea.problem}`, '', `Proposal: ${idea.proposal}`, '',
    `Files: ${(idea.files ?? []).join(', ') || '(not named)'}`, '', 'Acceptance:', ...(idea.acceptance ?? []).map((a) => `- ${a}`)].join('\n')
}

export function prBody({ scout, idea, build, review }) {
  return [
    `Proposed and built by the **${scout} scout** — no person asked for this. Merge it, change it, or close it; a closed scout pull request teaches the scout what you don't want.`,
    '', '## The problem', idea.problem, '', '## What changed', build.summary,
    '', '## How to check it', ...(idea.acceptance ?? []).map((a) => `- [ ] ${a}`),
    '', '## Automatic checks',
    `- Stays inside the browser app (\`ops/scouts/policy.mjs\`): yes — ${build.files} file${build.files === 1 ? '' : 's'}, ${build.lines} lines`,
    '- `npm test` and `npm run build`: passed' + (build.rounds > 1 ? ' (after one repair round)' : ''),
    `- Reviewed by a second model: approved`, ...(review.reasons ?? []).map((r) => `  - ${r}`),
    ...(review.risk ? ['', '## Look at this before merging', review.risk] : []),
    ...(build.notes ? ['', '## Builder notes', build.notes] : []),
    '', '🤖 Generated with [Claude Code](https://claude.com/claude-code)',
  ].join('\n')
}

const IDEA_SCHEMA = {
  type: 'object',
  properties: {
    skip: { type: 'boolean' }, reason: { type: 'string' }, title: { type: 'string' }, problem: { type: 'string' },
    proposal: { type: 'string' }, files: { type: 'array', items: { type: 'string' } }, acceptance: { type: 'array', items: { type: 'string' } },
  },
  required: ['skip'],
}
const BUILD_SCHEMA = {
  type: 'object',
  properties: { built: { type: 'boolean' }, summary: { type: 'string' }, notes: { type: 'string' } },
  required: ['built', 'summary'],
}
const REVIEW_SCHEMA = {
  type: 'object',
  properties: { verdict: { type: 'string', enum: ['approve', 'reject'] }, reasons: { type: 'array', items: { type: 'string' } }, risk: { type: 'string' } },
  required: ['verdict', 'reasons'],
}

// ── checking a finished build — by this file, not by the builder ──
function diffFiles(wt) {
  git(wt, 'add', '-A', '-N') // make new files visible to diff without staging content
  return parseGitDiff(git(wt, 'diff', '--numstat', 'HEAD'), git(wt, 'diff', '--name-status', 'HEAD'))
}
function checkBuild(wt) {
  const files = diffFiles(wt)
  const violations = checkDiff(files)
  if (violations.length) return { ok: false, why: `outside the allowed bounds:\n- ${violations.join('\n- ')}`, files }
  for (const [label, args] of [['npm test', ['--prefix', 'web', 'test']], ['npm run build', ['--prefix', 'web', 'run', 'build']]]) {
    try { run('npm', args, wt, { timeout: 10 * MIN }) } catch (e) {
      return { ok: false, why: `${label} failed:\n${String((e.stdout ?? '') + (e.stderr ?? '')).split('\n').filter((l) => /not ok|error|Error|fail/i.test(l)).slice(0, 30).join('\n')}`, files }
    }
  }
  return { ok: true, files }
}

// ── the graph ──────────────────────────────────────────────────
export function scoutsGraph({ only = SCOUTS, noPr = false, date = today() } = {}) {
  const scouts = SCOUTS.filter((s) => only.includes(s))
  const M = models()
  const wtPath = (s) => join(WORK, `${s}-${date}`)
  const branch = (s) => `scout/${s}-${date}`
  const skipped = (results, s) => results[`idea:${s}`]?.skip ? { skipped: true, reason: results[`idea:${s}`].reason } : null

  const nodes = [
    {
      id: 'preflight', always: true, label: 'Check Claude Code, GitHub and git; fetch main',
      run: async () => {
        run('claude', ['--version'])
        run('gh', ['auth', 'status'])
        git(ROOT, 'fetch', '-q', 'origin', 'main')
        for (const l of ['scout', ...SCOUTS.map((s) => `scout:${s}`)]) {
          try { run('gh', ['label', 'create', l, '--force', '--color', '5319E7', '--description', 'Proposed and built by a scout agent']) } catch { /* labels are a nicety */ }
        }
        // Old checkouts from failed or --no-pr runs: two weeks is long enough to have looked.
        if (existsSync(WORK)) {
          for (const d of readdirSync(WORK)) {
            if (Date.now() - statSync(join(WORK, d)).mtimeMs > 14 * 24 * 60 * MIN) {
              try { git(ROOT, 'worktree', 'remove', '--force', join(WORK, d)) } catch { rmSync(join(WORK, d), { recursive: true, force: true }) }
            }
          }
          try { git(ROOT, 'worktree', 'prune') } catch { /* nothing to prune */ }
        }
        return 'ok'
      },
    },
    {
      id: 'capture', needs: ['preflight'], optional: true, label: 'Screenshot every page (sample data) and measure usability',
      run: async () => {
        const out = join(ROOT, 'out/scouts', date, 'capture')
        rmSync(out, { recursive: true, force: true })
        const r = await capture({ web: join(ROOT, 'web'), out })
        return { dir: out, views: r.pages.length, failed: r.pages.filter((p) => p.failed).length }
      },
    },
    {
      id: 'history', needs: ['preflight'], optional: true, label: 'Read past scout pull requests (merged = liked, closed = rejected)',
      run: async () => Object.fromEntries(SCOUTS.map((s) => {
        const prs = JSON.parse(run('gh', ['pr', 'list', '--state', 'all', '--label', `scout:${s}`, '--limit', '40', '--json', 'number,title,state']))
        return [s, prs]
      })),
    },
  ]

  for (const s of scouts) {
    nodes.push(
      {
        id: `worktree:${s}`, needs: ['preflight'], label: `Private checkout of main for the ${s} scout`,
        run: async () => {
          const wt = wtPath(s)
          if (existsSync(wt)) { try { git(ROOT, 'worktree', 'remove', '--force', wt) } catch { rmSync(wt, { recursive: true, force: true }) } }
          mkdirSync(WORK, { recursive: true })
          git(ROOT, 'worktree', 'add', '-q', '-B', branch(s), wt, 'origin/main')
          // Tests and the build need the installed packages; share them rather than reinstalling.
          symlinkSync(join(ROOT, 'web/node_modules'), join(wt, 'web/node_modules'))
          const exclude = join(resolve(wt, git(wt, 'rev-parse', '--git-common-dir')), 'info/exclude')
          const have = existsSync(exclude) ? readFileSync(exclude, 'utf8') : ''
          for (const line of ['.scout/', 'web/node_modules']) if (!have.split('\n').includes(line)) appendFileSync(exclude, `\n${line}\n`)
          mkdirSync(join(wt, '.scout'), { recursive: true })
          return { path: wt, branch: branch(s) }
        },
      },
      {
        id: `idea:${s}`, needs: [`worktree:${s}`, 'capture', 'history'], label: `${s} scout picks one idea, or none`,
        run: async ({ results }) => {
          const prs = results.history?.[s] ?? []
          const open = prs.find((p) => p.state === 'OPEN')
          if (open) return { skip: true, reason: `pull request #${open.number} from this scout is still open` }
          const wt = results[`worktree:${s}`].path
          if (NEEDS_CAPTURE.has(s)) {
            if (!results.capture?.dir) return { skip: true, reason: 'no screenshots this week (capture failed)' }
            cpSync(results.capture.dir, join(wt, '.scout/capture'), { recursive: true })
          }
          const text = [prompt('_shared'), prompt(s), fill(prompt('idea'), { HISTORY: historyText(prs) })].join('\n\n')
          const { out } = await claude(text, wt, { model: M.author, schema: IDEA_SCHEMA, edits: false, tools: ['Read', 'Grep', 'Glob'], budget: 3 }, 20 * MIN)
          if (!out.skip && !(out.title && out.problem && out.proposal)) return { skip: true, reason: 'the scout returned an incomplete idea' }
          return out
        },
      },
      {
        id: `build:${s}`, needs: [`idea:${s}`], label: `Build it, then check bounds + tests + build (one repair round)`,
        run: async ({ results }) => {
          const skip = skipped(results, s); if (skip) return skip
          const wt = results[`worktree:${s}`].path
          const idea = results[`idea:${s}`]
          const base = [prompt('_shared'), fill(prompt('builder'), { IDEA: ideaText(idea) })].join('\n\n')
          const opts = {
            model: M.author, schema: BUILD_SCHEMA, edits: true, budget: 10,
            tools: ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash'],
            allowed: ['Bash(npm --prefix web test:*)', 'Bash(npm --prefix web run build:*)', 'Bash(node --test:*)', 'Bash(git diff:*)', 'Bash(git status:*)', 'Bash(ls:*)'],
          }
          let text = base
          for (let round = 1; round <= 2; round++) {
            const { out } = await claude(text, wt, opts, 40 * MIN)
            if (!out.built) throw new Error(`builder stopped: ${String(out.notes ?? out.summary).slice(0, 300)}`)
            const check = checkBuild(wt)
            if (check.ok) {
              const lines = check.files.reduce((n, f) => n + f.added + f.deleted, 0)
              return { summary: out.summary, notes: out.notes ?? '', rounds: round, files: check.files.length, lines }
            }
            say(`… build:${s} round ${round} did not pass: ${check.why.split('\n')[0]}`)
            if (round === 2) throw new Error(`dropped after a repair round — ${check.why.slice(0, 400)}`)
            text = `${base}\n\n## Your first attempt did not pass the checks\n\nYour changes are still in the checkout. Fix them — do not start over, and do not weaken a test.\n\n${check.why}`
          }
        },
      },
      {
        id: `review:${s}`, needs: [`build:${s}`], label: 'A second, stronger model approves or rejects',
        run: async ({ results }) => {
          const skip = skipped(results, s); if (skip) return skip
          const wt = results[`worktree:${s}`].path
          git(wt, 'add', '-A', '-N')
          writeFileSync(join(wt, '.scout/diff.patch'), git(wt, 'diff', 'HEAD'))
          const text = [prompt('_shared'), fill(prompt('reviewer'), { IDEA: ideaText(results[`idea:${s}`]), SUMMARY: results[`build:${s}`].summary })].join('\n\n')
          const { out } = await claude(text, wt, { model: M.reviewer, schema: REVIEW_SCHEMA, edits: false, tools: ['Read', 'Grep', 'Glob'], budget: 4 }, 20 * MIN)
          if (out.verdict !== 'approve') throw new Error(`reviewer rejected it: ${(out.reasons ?? []).join('; ').slice(0, 400)}`)
          return out
        },
      },
      {
        id: `pr:${s}`, needs: [`review:${s}`], label: 'Commit, push the branch, open a pull request',
        run: async ({ results }) => {
          const skip = skipped(results, s); if (skip) return skip
          const wt = results[`worktree:${s}`].path
          const idea = results[`idea:${s}`]
          if (noPr) return { held: true, path: wt, title: idea.title }
          // The reviewer was read-only, but re-check anyway: this is the last gate before a push.
          const violations = checkDiff(diffFiles(wt))
          if (violations.length) throw new Error(`refusing to push: ${violations.join('; ')}`)
          git(wt, 'add', '-A')
          git(wt, 'commit', '-q', '-m', `${idea.title}\n\nProposed and built by the ${s} scout (ops/graph/scouts.mjs).\n\nCo-Authored-By: Claude <noreply@anthropic.com>`)
          git(wt, 'push', '-q', '-u', 'origin', branch(s))
          const body = prBody({ scout: s, idea, build: results[`build:${s}`], review: results[`review:${s}`] })
          const url = run('gh', ['pr', 'create', '--base', 'main', '--head', branch(s), '--title', idea.title, '--body', body, '--label', 'scout', '--label', `scout:${s}`], wt).split('\n').at(-1)
          try { git(ROOT, 'worktree', 'remove', '--force', wt) } catch { /* left for the next preflight to clear */ }
          return { url, title: idea.title }
        },
      },
    )
  }

  nodes.push({
    id: 'digest', needs: scouts.map((s) => `pr:${s}`).concat('capture', 'history'), always: true, optional: true, label: 'One summary notification',
    run: async () => 'done', // the summary is built from the whole state in main(), where failures are visible too
  })
  return nodes
}

/** One line per scout, from the final state — failures included. */
export function summarize(state, scouts = SCOUTS) {
  return scouts.map((s) => {
    const n = (id) => state.nodes[`${id}:${s}`]
    const pr = n('pr')?.value
    if (pr?.url) return `${s}: opened ${pr.url}`
    if (pr?.held) return `${s}: built "${pr.title}", held (--no-pr)`
    const idea = n('idea')?.value
    if (idea?.skip) return `${s}: no proposal — ${idea.reason ?? 'nothing worth building'}`
    const failed = ['worktree', 'idea', 'build', 'review', 'pr'].map((id) => [id, n(id)]).find(([, v]) => v?.status === 'failed')
    if (failed) return `${s}: stopped at ${failed[0]} — ${String(failed[1].error).slice(0, 160)}`
    return `${s}: did not run`
  })
}

function notify(text) {
  try { execFileSync('/usr/bin/osascript', ['-e', `display notification ${JSON.stringify(text)} with title "IFFL scouts"`], { stdio: 'ignore' }) } catch { /* never fail on a notification */ }
}

async function main() {
  const argv = process.argv.slice(2)
  const flag = (f) => argv.includes(f)
  const oi = argv.indexOf('--only')
  const only = oi >= 0 ? argv[oi + 1].split(',') : SCOUTS
  const nodes = scoutsGraph({ only, noPr: flag('--no-pr') })

  if (flag('--plan')) {
    console.log('Scouts — steps on the same line run side by side:\n')
    levels(nodes).forEach((wave, i) => console.log(`  ${i + 1}. ${wave.join('   |   ')}`))
    console.log('')
    for (const n of nodes) console.log(`  ${n.id}: ${n.label}`)
    const M = models()
    console.log(`\n  scouts + builder: ${M.author}   reviewer: ${M.reviewer}`)
    console.log('\n(plan only — nothing was run)')
    return 0
  }

  const dir = join(ROOT, 'out/runs')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `scouts-${today()}${oi >= 0 ? `-${only.join('+')}` : ''}.json`)
  let state
  if (!flag('--fresh') && existsSync(file)) {
    try { const prev = JSON.parse(readFileSync(file, 'utf8')); if (!prev.finishedAt) { state = prev; say(`resuming ${file}`) } } catch { /* unreadable = none */ }
  }
  const { state: st } = await runGraph(nodes, { state, log: say, save: async (s) => writeFileSync(file, JSON.stringify(s, null, 2)) })
  writeFileSync(file, JSON.stringify({ ...st, finishedAt: new Date().toISOString() }, null, 2))

  const lines = summarize(st, SCOUTS.filter((s) => only.includes(s)))
  for (const l of lines) say(l)
  const opened = lines.filter((l) => l.includes('opened')).length
  notify(opened ? `${opened} new pull request${opened > 1 ? 's' : ''} to look at` : `No pull requests this week — ${lines[0]}`)
  // A scout proposing nothing, or a reviewer rejecting, is the system working. Only a broken preflight is a failed run.
  return st.nodes.preflight?.status === 'done' ? 0 : 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code), (e) => { say(`FAILED — ${e.message}`); notify(`FAILED — ${e.message}`); process.exit(1) })
}
