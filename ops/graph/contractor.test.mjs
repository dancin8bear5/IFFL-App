import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Contractor, Stop, loginProblem, prBody } from './contractor.mjs'
import { CAPS, MAX_HIRES, blueprintProblems, diffProblems, finalTests, flags, planProblems, reportProblems, slug } from '../contractor/checks.mjs'
import { treeHtml } from '../contractor/tree.mjs'

// No Claude, no git, no GitHub: a fake crew and a fake checkout. What is
// under test is the contractor's own judgement — who it hires, what it
// refuses, when it stops.

const f = (path, added = 10, deleted = 0, status = 'A') => ({ path, added, deleted, status })
const T = (id, area = 'web', extra = {}) => ({ id, name: `${id} — builds a thing`, area, job: `Build the ${id} part.`, ...extra })
const BP = (trades) => ({
  buildable: true, title: 'Add a thing', summary: 'Members see a new thing.', contract: 'calc.js exports thing(); Thing.jsx uses it.',
  acceptance: ['The thing shows on the Dashboard'], needsYou: [], trades,
})

function fakeRepo() {
  const r = {
    pending: [], all: [], commits: [], checks: [], prs: [], puts: {}, failCheck: null,
    preflight() {},
    open(id, existing) { return existing ?? { path: `/wt/${id}`, branch: `contractor/${id}`, base: 'base' } },
    put(wt, name, text) { r.puts[name] = text },
    diff(wt, from = 'HEAD') { return from === 'HEAD' ? r.pending : r.all },
    patch() { return 'PATCH' },
    commit(wt, message) { r.all.push(...r.pending); r.pending = []; r.commits.push(message); return `sha${r.commits.length}` },
    check(wt, kinds) { r.checks.push(kinds); return r.failCheck ? r.failCheck(kinds) : null },
    pr(wt, o) { r.prs.push(o); return 'https://github.example/pr/1' },
  }
  return r
}

/** `script(call, n)` answers each hire; it may put files in repo.pending, as a real trade edits the checkout. */
function crew(script) {
  const repo = fakeRepo()
  const calls = []
  const hire = async (call) => { calls.push(call); return { out: await script(call, calls.length, repo), cost: 0.5 } }
  const dir = mkdtempSync(join(tmpdir(), 'contractor-'))
  const said = []
  const c = new Contractor({ dir, hire, repo, say: (l) => said.push(l), app: 'THE APP', now: () => new Date('2026-11-26T15:04:00Z') })
  return { c, repo, calls, dir, said, again: () => new Contractor({ dir, hire, repo, say: (l) => said.push(l), app: 'THE APP' }) }
}

const who = (call) => /You are (?:the|a) ([A-Z ]+?)[ .]on a build crew/.exec(call.prompt)?.[1]

/** A crew where everything goes right; `over` replaces single answers. */
const smooth = (bp, over = {}) => async (call, n, repo) => {
  if (over[n]) return over[n](call, repo)
  if (call.kind === 'architect') return bp
  if (call.kind === 'plan') return { glue: 'join them', helpers: [{ id: 'calc', name: 'Calc — the maths', job: 'Write the maths.' }, { id: 'view', name: 'View — the screen', job: 'Write the screen.' }] }
  if (call.kind === 'inspector') return { pass: true, problems: [], risk: '' }
  if (!call.prompt.includes('Your helpers have finished')) repo.pending = [f(`web/src/services/part${n}.js`)]
  return { done: true, summary: `did job ${n}` }
}

// ── the rules ──────────────────────────────────────────────────

test('a sound blueprint passes; the usual mistakes are each named', () => {
  assert.deepEqual(blueprintProblems(BP([T('calc'), T('rule', 'rules')])), [])
  assert.match(blueprintProblems(BP([T('calc', 'ops')]))[0], /area must be one of/)
  assert.match(blueprintProblems(BP([T('architect')]))[0], /bad id/)
  assert.match(blueprintProblems(BP([T('a1'), T('a1')])).join(), /share the id/)
  assert.match(blueprintProblems(BP([])).join(), /at least 1 trade/)
  assert.match(blueprintProblems({ ...BP([T('calc')]), acceptance: [] }).join(), /acceptance/)
  assert.match(blueprintProblems('nope')[0], /not an object/)
})

test('the size cap counts the helpers a lead will hire', () => {
  const five = ['a1', 'b1', 'c1', 'd1', 'e1'].map((id) => T(id))
  assert.deepEqual(blueprintProblems(BP(five)), [])
  assert.match(blueprintProblems(BP([...five.slice(0, 4), T('big', 'web', { lead: true })])).join(), /over the cap of 6/)
  assert.match(blueprintProblems(BP([T('x1', 'web', { lead: true }), T('y1', 'web', { lead: true })])).join(), /at most 1/)
  assert.equal(MAX_HIRES, CAPS.trades + 2)
})

test('"cannot be built" is a valid answer only with a reason', () => {
  assert.deepEqual(blueprintProblems({ buildable: false, reason: 'It needs live league data the crew cannot reach.' }), [])
  assert.match(blueprintProblems({ buildable: false })[0], /no reason/)
})

test('a lead may ask for one or two helpers with ids nobody holds', () => {
  const h = (id) => ({ id, name: `${id} helper`, job: 'Write one piece.' })
  assert.deepEqual(planProblems({ glue: 'g', helpers: [h('calc'), h('view')] }, new Set(), 'big'), [])
  assert.match(planProblems({ glue: 'g', helpers: [h('a1'), h('b1'), h('c1')] }, new Set(), 'big')[0], /1 to 2 helpers/)
  assert.match(planProblems({ glue: 'g', helpers: [h('calc')] }, new Set(['big-calc']), 'big')[0], /already used/)
  assert.match(planProblems({ glue: 'g', helpers: [h('Bad-Id')] }, new Set(), 'big')[0], /bad id/)
  assert.match(planProblems({}, new Set(), 'big')[0], /must be/)
})

test('a trade may only change files in its own area', () => {
  assert.deepEqual(diffProblems([f('web/src/services/x.js'), f('web/src/services/x.test.js')], 'web'), [])
  assert.match(diffProblems([f('functions/leagueFeed.js')], 'web')[0], /outside this trade's area/)
  assert.deepEqual(diffProblems([f('functions/leagueFeed.js', 5, 2, 'M')], 'functions'), [])
  assert.deepEqual(diffProblems([f('firestore.rules', 4, 0, 'M')], 'rules'), [])
  assert.match(diffProblems([], 'web')[0], /no changes/)
  assert.deepEqual(diffProblems([], 'web', { allowEmpty: true }), [])
})

test('some files are off limits in every area', () => {
  for (const p of ['.github/workflows/deploy.yml', 'ops/espn-weekly.sh', 'data/trades-2025-on.csv', 'web/.env', 'web/package.json',
    'functions/package-lock.json', 'firebase.json', 'ops/com.iffl.scouts.plist', 'web/src/data/powerRankings2026.json']) {
    assert.match(diffProblems([f(p)], null)[0], /off limits/, p)
  }
  assert.match(diffProblems([f('README.md')], null)[0], /outside every area/)
  assert.match(diffProblems([f('../elsewhere.js')], null)[0], /escapes/)
})

test('no deleted files, no gutted tests, no oversized builds', () => {
  assert.match(diffProblems([f('web/src/views/Old.jsx', 0, 80, 'D')], 'web')[0], /may not delete/)
  assert.match(diffProblems([f('web/src/services/a.test.js', 2, 40, 'M')], 'web')[0], /lost more lines/)
  assert.match(diffProblems([f('ops/graph/x.test.mjs', 2, 40, 'M')], null)[0], /off limits/)
  assert.match(diffProblems(Array.from({ length: 31 }, (_, i) => f(`web/src/a${i}.js`, 1)), null).join(), /31 files changed/)
  assert.match(diffProblems([f('web/src/big.js', 2001)], 'web').join(), /2001 lines changed/)
})

test('risky-but-allowed files become plain warnings; functions get their tests run', () => {
  const files = [f('firestore.rules', 3, 0, 'M'), f('functions/leagueFeed.js', 3, 0, 'M'), f('web/src/views/AdminView.jsx', 3, 0, 'M')]
  assert.equal(flags(files).length, 3)
  assert.deepEqual(flags([f('web/src/services/x.js')]), [])
  assert.deepEqual(finalTests(files), ['web-test', 'web-build', 'functions-test'])
  assert.deepEqual(finalTests([f('web/src/services/x.js')]), ['web-test', 'web-build'])
})

test('the inspector must name real trades', () => {
  const ids = new Set(['calc'])
  assert.deepEqual(reportProblems({ pass: false, problems: [{ trade: 'calc', problem: 'thing() is never called' }] }, ids), [])
  assert.equal(reportProblems({ pass: false, problems: [{ trade: 'ghost', problem: 'something is off' }] }, ids).length, 1)
  assert.equal(reportProblems({ problems: [] }, ids).length, 1)
})

test('a request becomes a short safe name', () => {
  assert.equal(slug('Add a "Playoff Odds" tile!'), 'add-a-playoff-odds-tile')
  assert.equal(slug('???'), 'build')
  assert.ok(slug('x'.repeat(200)).length <= 40)
})

// ── the contractor ─────────────────────────────────────────────

test('a clean build: architect, each trade in order, inspector, pull request', async () => {
  const bp = BP([T('calc'), T('rule', 'rules')])
  const { c, repo, calls, dir } = crew(smooth(bp, { 3: (call, r) => { r.pending = [f('firestore.rules', 4, 0, 'M')]; return { done: true, summary: 'added the rule' } } }))
  assert.equal(await c.build('add a thing'), 0)
  assert.deepEqual(calls.map((x) => x.kind), ['architect', 'trade', 'trade', 'inspector'])
  assert.equal(calls[0].cwd, c.state.worktree.path)
  assert.deepEqual(repo.commits.map((m) => m.split(']')[0]), ['[calc', '[rule'])
  // the web trade answered to the web tests; the rules trade had none to run; then the whole build
  assert.deepEqual(repo.checks, [['web-test'], [], ['web-test', 'web-build']])
  assert.equal(repo.puts['diff.patch'], 'PATCH')
  assert.equal(repo.prs[0].draft, false)
  assert.equal(repo.prs[0].title, 'Add a thing')
  assert.match(repo.prs[0].body, /> add a thing/)
  assert.match(repo.prs[0].body, /security rules/) // the warning for touching firestore.rules
  assert.equal(c.state.status, 'done')
  assert.match(readFileSync(join(dir, 'build/crew/calc/brief.md'), 'utf8'), /Build the calc part\./)
  assert.match(readFileSync(join(dir, 'build/tree.html'), 'utf8'), /Finished/)
})

test('every hire is told about the app and the house rules', async () => {
  const { c, calls } = crew(smooth(BP([T('calc')])))
  await c.build('add a thing')
  for (const call of calls) assert.match(call.prompt, /^THE APP/)
  assert.match(calls[1].prompt, /repository is PUBLIC/)
  assert.match(calls[1].prompt, /\.contractor\/blueprint\.json/)
})

test('a trade that leaves its area is rejected, told why, and gets one more try', async () => {
  const { c, repo, calls } = crew(smooth(BP([T('calc')]), {
    2: (call, r) => { r.pending = [f('functions/index.js', 3, 0, 'M')]; return { done: true, summary: 'oops' } },
  }))
  assert.equal(await c.build('add a thing'), 0)
  assert.deepEqual(calls.map((x) => x.kind), ['architect', 'trade', 'trade', 'inspector'])
  assert.match(calls[2].prompt, /rejected by the code check[\s\S]*functions\/index\.js: outside this trade's area/)
  assert.equal(c.agent('calc').tries, 2)
  assert.equal(repo.commits.length, 1)
})

test('failing tests reject a trade just as leaving its area does', async () => {
  let n = 0
  const { c, repo, calls } = crew(smooth(BP([T('calc')])))
  repo.failCheck = () => (++n === 1 ? 'web-test failed:\nnot ok 3 - thing()' : null)
  assert.equal(await c.build('add a thing'), 0)
  assert.match(calls[2].prompt, /not ok 3 - thing\(\)/)
})

test('a second failure stops the build; running it again resumes without rehiring', async () => {
  const bp = BP([T('calc'), T('view')])
  let broken = true
  const k = crew(async (call, n, repo) => {
    if (broken && call.prompt.includes('Build the view part.')) return { done: false, summary: '', notes: 'the contract names a file that does not exist' }
    return smooth(bp)(call, n, repo)
  })
  assert.equal(await k.c.build('add a thing'), 1)
  assert.equal(k.c.state.status, 'stopped')
  assert.equal(k.c.agent('view').status, 'failed')
  assert.match(k.said.at(-1), /STOPPED: view — builds a thing failed its check twice: it stopped without finishing/)
  assert.equal(k.repo.prs.length, 0)

  broken = false
  const before = k.calls.length
  const c2 = k.again()
  assert.equal(await c2.build(), 0)
  // only the failed trade and the inspector were hired this time
  assert.deepEqual(k.calls.slice(before).map((x) => x.kind), ['trade', 'inspector'])
  assert.equal(k.repo.prs.length, 1)
})

test('a crashed session counts as a failed try, not a crashed contractor', async () => {
  const { c, calls } = crew(smooth(BP([T('calc')]), { 2: () => { throw new Error('claude ran past 40 min') } }))
  assert.equal(await c.build('add a thing'), 0)
  assert.match(calls[2].prompt, /the session did not finish: claude ran past 40 min/)
})

test('a lead hires its own helpers, then joins their work', async () => {
  const { c, repo, calls } = crew(smooth(BP([T('big', 'web', { lead: true })])))
  assert.equal(await c.build('add a thing'), 0)
  assert.deepEqual(calls.map((x) => `${x.kind}:${who(x)}`), ['architect:ARCHITECT', 'plan:LEAD TRADE', 'trade:HELPER', 'trade:HELPER', 'trade:TRADE', 'inspector:INSPECTOR'])
  const helpers = c.state.agents.filter((a) => a.role === 'helper')
  assert.deepEqual(helpers.map((a) => [a.id, a.madeBy, a.leadId]), [['big-calc', 'big trade', 'big'], ['big-view', 'big trade', 'big']])
  assert.match(calls[2].prompt, /How the lead plans to join the work: join them/)
  assert.match(calls[4].prompt, /Your helpers have finished[\s\S]*big-calc, big-view/)
  // the lead changed nothing itself — allowed, because its helpers did the work
  assert.deepEqual(repo.commits.map((m) => m.split(']')[0]), ['[big-calc', '[big-view', '[big'])
  assert.match(repo.prs[0].body, /a lead: it hired its own helpers/)
  assert.match(treeHtml(c.state), /Defined by the big trade \(a lead\)/)
})

test('a lead that asks for too many helpers is refused', async () => {
  const three = { glue: 'g', helpers: ['a1', 'b1', 'c1'].map((id) => ({ id, name: `${id} helper`, job: 'Write one piece.' })) }
  const { c, calls } = crew(smooth(BP([T('big', 'web', { lead: true })]), { 2: () => three, 3: () => three }))
  assert.equal(await c.build('add a thing'), 1)
  assert.equal(calls.length, 3)
  assert.match(c.agent('big').note, /1 to 2 helpers/)
})

test('the inspector names a trade; it fixes its part; a second inspection passes', async () => {
  const { c, repo, calls } = crew(smooth(BP([T('calc'), T('view')]), {
    4: () => ({ pass: false, problems: [{ trade: 'view', problem: 'Thing.jsx never calls thing()' }], risk: '' }),
  }))
  assert.equal(await c.build('add a thing'), 0)
  assert.deepEqual(calls.map((x) => x.kind), ['architect', 'trade', 'trade', 'inspector', 'trade', 'inspector'])
  assert.match(calls[4].prompt, /The inspector found a problem in your part[\s\S]*never calls thing\(\)/)
  assert.match(calls[4].prompt, /Build the view part\./)
  assert.equal(repo.prs[0].draft, false)
  assert.equal(c.state.inspections, 2)
})

test('problems that survive two inspections open a DRAFT with them at the top', async () => {
  const bad = () => ({ pass: false, problems: [{ trade: 'calc', problem: 'ties are counted as wins' }], risk: 'Check the tie rule.' })
  const { c, repo } = crew(smooth(BP([T('calc')]), { 3: bad, 5: bad }))
  assert.equal(await c.build('add a thing'), 0)
  assert.equal(repo.prs[0].draft, true)
  assert.match(repo.prs[0].body, /^> \*\*Draft — the inspector still lists problems/)
  assert.match(repo.prs[0].body, /calc: ties are counted as wins/)
  assert.match(repo.prs[0].body, /Check the tie rule\./)
})

test('a whole build that fails gets one repair, then stops', async () => {
  const k = crew(smooth(BP([T('calc')])))
  k.repo.failCheck = (kinds) => (kinds.includes('web-build') ? 'web-build failed:\nerror: Could not resolve "./Thing.jsx"' : null)
  assert.equal(await k.c.build('add a thing'), 1)
  assert.deepEqual(k.calls.map((x) => x.kind), ['architect', 'trade', 'trade'])
  assert.match(k.calls[2].prompt, /the whole build does not[\s\S]*Could not resolve/)
  assert.match(k.said.at(-1), /still fails its checks/)
  assert.equal(k.repo.prs.length, 0)
})

test('the architect may say it cannot be built — nobody else is hired', async () => {
  const { c, repo, calls, again } = crew(async () => ({ buildable: false, reason: 'That needs every member\'s email, which may not be put in a public repo.' }))
  assert.equal(await c.build('email everyone their roster'), 1)
  assert.equal(c.state.status, 'declined')
  assert.equal(calls.length, 1)
  assert.equal(repo.prs.length, 0)
  assert.equal(await again().build(), 1) // and it does not ask again
  assert.equal(calls.length, 1)
})

test('plan hires only the architect; build then carries on from the blueprint', async () => {
  const k = crew(smooth(BP([T('calc')])))
  assert.equal(await k.c.build('add a thing', { planOnly: true }), 0)
  assert.equal(k.c.state.status, 'planned')
  assert.deepEqual(k.calls.map((x) => x.kind), ['architect'])
  assert.match(k.repo.puts['blueprint.json'], /"contract"/)
  assert.equal(await k.again().build(), 0)
  assert.deepEqual(k.calls.map((x) => x.kind), ['architect', 'trade', 'inspector'])
})

test('--no-pr builds and inspects but opens nothing', async () => {
  const { c, repo } = crew(smooth(BP([T('calc')])))
  assert.equal(await c.build('add a thing', { noPr: true }), 0)
  assert.equal(repo.prs.length, 0)
  assert.equal(c.state.status, 'done')
})

test('a new request will not trample an unfinished build, but shelves a finished one', async () => {
  const k = crew(async (call, n, repo) => (call.kind === 'trade' && k.block ? { done: false, summary: '', notes: 'stuck' } : smooth(BP([T('calc')]))(call, n, repo)))
  k.block = true
  assert.equal(await k.c.build('first thing'), 1)
  assert.equal(await k.again().build('second thing'), 1)
  assert.match(k.said.at(-1), /a different build is unfinished/)
  k.block = false
  assert.equal(await k.again().build(), 0) // finish the first
  const c3 = k.again()
  assert.equal(await c3.build('second thing'), 0)
  assert.equal(c3.state.request, 'second thing')
  assert.equal(k.repo.prs.length, 2)
  // the first build's record was moved, not deleted
  assert.ok(existsSync(join(k.dir, 'archive')))
  assert.equal(JSON.parse(readFileSync(join(k.dir, 'archive', `first-thing-20261126-1504`, 'state.json'), 'utf8')).request, 'first thing')
})

test('the hire cap holds even if a blueprint slips past', async () => {
  const k = crew(smooth(BP([T('calc')])))
  await k.c.build('add a thing', { planOnly: true })
  for (let i = k.c.state.agents.length; i < MAX_HIRES; i++) k.c.enrol(`x${i}`, 'trade', `x${i}`, 'architect')
  assert.throws(() => k.c.enrol('one-too-many', 'trade', 'x', 'architect'), /cap of 8 hires/)
})

test('the pull request and the page escape what agents wrote', () => {
  const state = {
    request: 'add <b>a thing</b>', status: 'building', title: '<script>x</script>', log: ['a & b'], openProblems: [], risk: '',
    blueprint: BP([T('calc')]), agents: [{ id: 'calc', role: 'trade', name: 'calc <i>', madeBy: 'architect', status: 'passed', tries: 1, cost: 0.5, secs: 3, summary: 'did it' }],
  }
  const html = treeHtml(state)
  assert.ok(!html.includes('<script>x</script>'))
  assert.ok(html.includes('http-equiv="refresh"')) // refreshes itself while building
  assert.match(prBody(state, [f('web/src/x.js')]), /Generated with \[Claude Code\]/)
})

test('a signed-out Mac is caught before anyone is hired', async () => {
  assert.equal(loginProblem('{"loggedIn": true}'), null)
  assert.match(loginProblem('{"loggedIn": false}'), /claude auth login/)
  assert.match(loginProblem('not json'), /signed out/)
  const k = crew(smooth(BP([T('calc')])))
  k.repo.preflight = () => { throw new Stop(loginProblem('{"loggedIn": false}')) }
  assert.equal(await k.c.build('add a thing'), 1)
  assert.equal(k.calls.length, 0)
  assert.match(k.said.at(-1), /STOPPED: Claude Code is signed out/)
  k.repo.preflight = () => {}
  assert.equal(await k.again().build(), 0) // signing in and running build again is all it takes
})
