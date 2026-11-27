import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Answers, answerForBuild, realDesk, sealProfile } from './answer.mjs'
const HERE = dirname(fileURLToPath(import.meta.url))
import { calcProblems, checkerProblems, knownNumbers, methodProblems, reportHtml, resultProblems, trimPlayer, wordProblems } from '../contractor/answer.mjs'

// No Claude, no database, no sandbox: a fake crew and a fake desk. What is
// under test is the rule the mode exists for — code computes every number.

const PLAN = { answerable: true, title: 'WR points against M. Zurek', method: 'Add up started WR points against him each week.', steps: ['Filter PlayerWeek rows'], shows: ['a table'] }
const RESULT = { facts: [{ label: 'WR points per game against M. Zurek', value: 41.27, unit: 'pts' }, { label: 'League average', value: 36.5, unit: 'pts' }], tables: [{ title: 'By week', columns: ['Week', 'WR points'], rows: [[1, 44.1], [2, 38.44]] }], notes: ['11 weeks counted'] }
const WORDS = { headline: 'WRs score 41.3 a game against M. Zurek, above the 36.5 league average.', paragraphs: ['Week 1 was the worst at 44.1.'], caveats: [] }

function fakeDesk(over = {}) {
  const d = {
    disk: {}, shown: [], runs: 0, printed: JSON.stringify(RESULT), snapshot: { at: '2026-11-27T12:00:00Z', count: 300 },
    preflight() {},
    async open() { return d.snapshot },
    files(folder) { return Object.keys(d.disk).filter((k) => k.startsWith(`${folder}/`) && !k.slice(folder.length + 1).includes('/')).map((k) => k.slice(folder.length + 1)) },
    read(folder, name) { return d.disk[`${folder}/${name}`] ?? '' },
    write(folder, name, text) { d.disk[`${folder}/${name}`] = text },
    run() { d.runs += 1; return typeof d.printed === 'function' ? d.printed(d.runs) : d.printed },
    show(p) { d.shown.push(p) },
    ...over,
  }
  return d
}

const CALC = "import { readFileSync } from 'node:fs'\nconsole.log(JSON.stringify({facts:[]}))\n"

/** A crew where everything goes right; `over[kind]` replaces one hire's answers (called with its try number). */
function crew(over = {}, deskOver = {}) {
  const desk = fakeDesk(deskOver)
  const calls = []
  const tries = {}
  const hire = async (call) => {
    calls.push(call)
    tries[call.kind] = (tries[call.kind] ?? 0) + 1
    if (over[call.kind]) return { out: await over[call.kind](tries[call.kind], call, desk), cost: 0.25 }
    if (call.kind === 'analyst') return { out: PLAN, cost: 0.25 }
    if (call.kind === 'calculator') { desk.write(call.cwd, 'calc.mjs', CALC); return { out: { done: true, summary: 'adds it up' }, cost: 0.25 } }
    if (call.kind === 'checker') return { out: { pass: true, problems: [], caveats: ['small sample'] }, cost: 0.25 }
    return { out: WORDS, cost: 0.25 }
  }
  const said = []
  const a = new Answers({ dir: '/answers', hire, desk, say: (l) => said.push(l), now: () => new Date('2026-11-27T15:04:00Z') })
  return { a, desk, calls, said, kinds: () => calls.map((c) => c.kind) }
}

// ── the checks ─────────────────────────────────────────────────

test('only the allowed player fields leave the database', () => {
  const doc = { fields: { name: { stringValue: 'Dak Prescott' }, teamName: { stringValue: 'A. Zurek' }, prices: { mapValue: { fields: { 2026: { integerValue: '36' } } } }, ownerEmail: { stringValue: 'someone@example.com' }, uid: { stringValue: 'abc' } } }
  assert.deepEqual(trimPlayer(doc), { name: 'Dak Prescott', teamName: 'A. Zurek', prices: { 2026: 36 } })
})

test('a calculation may read files and nothing else', () => {
  assert.deepEqual(calcProblems(CALC), [])
  assert.match(calcProblems('')[0], /missing/)
  assert.match(calcProblems("import { execSync } from 'node:child_process'")[0], /only node:fs and node:path/)
  assert.ok(calcProblems("const r = await fetch('https://x')").some((p) => /network/.test(p)))
  assert.ok(calcProblems("import fs from 'node:fs'\nfs.writeFileSync('a','b')").some((p) => /writes or deletes/.test(p)))
  assert.ok(calcProblems('const k = process.env.HOME').some((p) => /environment/.test(p)))
  assert.ok(calcProblems("const m = await import('node:http')").length > 0)
})

test('the sandbox denies the network, writes, and reads outside the folder', () => {
  const p = sealProfile('/Users/x/out/answers/q', '/Users/x', '/Users/x/.nvm/v22')
  assert.match(p, /\(deny network\*\)/)
  assert.match(p, /\(deny file-write\*\)/)
  assert.match(p, /\(deny file-read\* \(subpath "\/Users\/x"\)\)\(allow file-read\* \(subpath "\/Users\/x\/out\/answers\/q"\)/)
  // Node lstat-s every folder above its script: those may be stat-ed, nothing more.
  assert.match(p, /\(allow file-read-metadata \(literal "\/Users\/x"\) .*\(literal "\/Users\/x\/out\/answers"\)\)$/)
  assert.doesNotMatch(p, /file-read-metadata[^)]*\(literal "\/Users"\)/)
})

test('an output with a hole in it is refused', () => {
  assert.deepEqual(resultProblems(RESULT), [])
  assert.match(resultProblems([])[0], /one JSON object/)
  assert.match(resultProblems({ facts: [], tables: [] })[0], /empty/)
  assert.match(resultProblems({ facts: [{ label: 'x', value: null }] })[0], /not \{label, value\}/) // NaN prints as null
  assert.match(resultProblems({ tables: [{ title: 't', columns: ['a', 'b'], rows: [['x']] }] })[0], /does not match its columns/)
  assert.match(resultProblems({ tables: [{ title: 't', columns: ['a'], rows: Array.from({ length: 201 }, () => [1]) }] })[0], /200 at most/)
})

test('a number in the words must come from the calculation', () => {
  assert.deepEqual(wordProblems(WORDS, RESULT, 'WR scores vs M. Zurek'), [])
  // rounded is fine, invented is not
  assert.deepEqual(wordProblems({ headline: 'About 41 a game.', paragraphs: ['Against 37 for the league.'] }, RESULT), [])
  assert.match(wordProblems({ headline: 'That is 4.77 more than average.', paragraphs: ['x'] }, RESULT)[0], /4\.77/)
  // a number you typed in the question may be repeated
  assert.deepEqual(wordProblems({ headline: 'In 2026 it was 41.27.', paragraphs: ['x'] }, RESULT, 'best of 2026'), [])
  assert.match(wordProblems({ headline: 'In 2025 it was 41.27.', paragraphs: ['x'] }, RESULT, 'best of 2026')[0], /2025/)
  assert.match(wordProblems({ headline: 'x', paragraphs: [] }, RESULT)[0], /headline and at least one paragraph/)
  assert.ok(knownNumbers(RESULT).includes(11)) // counted in a note
})

test('an analyst may refuse, but must say why or what to ask', () => {
  assert.deepEqual(methodProblems(PLAN), [])
  assert.deepEqual(methodProblems({ answerable: false, ask: ['What counts as a bust?'] }), [])
  assert.match(methodProblems({ answerable: false })[0], /no reason or question/)
  assert.ok(methodProblems({ answerable: true, title: 'x' }).length === 2)
  assert.match(checkerProblems({ pass: false, problems: [] })[0], /named no problem/)
})

// ── the crew ───────────────────────────────────────────────────

test('a clean run: analyst, calculator, checker, writer — and the report shows the numbers', async () => {
  const { a, desk, kinds } = crew()
  assert.equal(await a.ask('WR scores vs M. Zurek'), 0)
  assert.deepEqual(kinds(), ['analyst', 'calculator', 'checker', 'writer'])
  assert.equal(a.state.status, 'done')
  assert.equal(desk.runs, 1) // the contractor ran the calculation itself
  const html = desk.read(a.state.folder, 'report.html')
  assert.match(html, /41\.27/)
  assert.match(html, /above the 36\.5 league average/)
  assert.match(html, /small sample/)
  assert.match(html, /build --answer wr-scores-vs-m-zurek-20261127-1504/)
  assert.deepEqual(desk.shown, [join(a.state.folder, 'report.html')])
  assert.deepEqual(JSON.parse(desk.read(a.state.folder, 'result.json')), RESULT)
})

test('an undefined term stops the crew and puts the question in the report', async () => {
  const { a, desk, kinds } = crew({ analyst: () => ({ answerable: false, ask: ['What counts as a "bust"?'] }) })
  assert.equal(await a.ask('who was the biggest bust'), 1)
  assert.deepEqual(kinds(), ['analyst'])
  assert.equal(a.state.status, 'needs-you')
  assert.match(desk.read(a.state.folder, 'report.html'), /What counts as a &quot;bust&quot;\?/)
})

test('the numbers are what the sealed run printed, never what the calculator said', async () => {
  const { a } = crew({ calculator: (n, call, desk) => { desk.write(call.cwd, 'calc.mjs', CALC); return { done: true, summary: 'The answer is 99.9 points' } } })
  await a.ask('q')
  assert.deepEqual(a.state.result, RESULT)
  assert.doesNotMatch(JSON.stringify(a.state.result), /99\.9/)
})

test('a calculation that will not run gets one retry, then the crew stops', async () => {
  const one = crew({}, { printed: (n) => { if (n === 1) throw Object.assign(new Error('x'), { stderr: 'ReferenceError: rows is not defined' }); return JSON.stringify(RESULT) } })
  assert.equal(await one.a.ask('q'), 0)
  assert.match(one.calls[2].prompt, /REJECTED[\s\S]*rows is not defined/)
  const two = crew({}, { printed: () => 'not json' })
  assert.equal(await two.a.ask('q'), 1)
  assert.equal(two.a.state.status, 'stopped')
  assert.deepEqual(two.kinds(), ['analyst', 'calculator', 'calculator'])
})

test('a calculator that writes a second file, or forbidden code, is refused before anything runs', async () => {
  const extra = crew({ calculator: (n, call, desk) => { desk.write(call.cwd, 'calc.mjs', CALC); if (n === 1) desk.write(call.cwd, 'notes.txt', 'x'); else delete desk.disk[`${call.cwd}/notes.txt`]; return { done: true, summary: 's' } } })
  assert.equal(await extra.a.ask('q'), 0)
  assert.match(extra.calls[2].prompt, /you also created notes\.txt/)
  const net = crew({ calculator: (n, call, desk) => { desk.write(call.cwd, 'calc.mjs', "await fetch('https://x')"); return { done: true, summary: 's' } } })
  assert.equal(await net.a.ask('q'), 1)
  assert.equal(net.desk.runs, 0)
})

test('the checker gets one fix out of the calculator; doubts that survive lead the report', async () => {
  const fixed = crew({ checker: (n) => (n === 1 ? { pass: false, problems: ['bench players are counted'] } : { pass: true, problems: [] }) })
  assert.equal(await fixed.a.ask('q'), 0)
  assert.deepEqual(fixed.kinds(), ['analyst', 'calculator', 'checker', 'calculator', 'checker', 'writer'])
  assert.match(fixed.calls[3].prompt, /found it WRONG[\s\S]*bench players are counted/)
  assert.deepEqual(fixed.a.state.openProblems, [])

  const stuck = crew({ checker: () => ({ pass: false, problems: ['playoff weeks are mixed in'] }) })
  assert.equal(await stuck.a.ask('q'), 0)
  assert.equal(stuck.kinds().filter((k) => k === 'calculator').length, 2) // one fix, not a loop
  assert.match(stuck.desk.read(stuck.a.state.folder, 'report.html'), /The checker still doubts this[\s\S]*playoff weeks are mixed in/)
})

test('a write-up with an invented number is dropped; the numbers still ship', async () => {
  const { a, desk, kinds } = crew({ writer: () => ({ headline: 'He allows 55.5 a game.', paragraphs: ['x'] }) })
  assert.equal(await a.ask('q'), 0)
  assert.equal(kinds().filter((k) => k === 'writer').length, 2)
  assert.equal(a.state.words, null)
  const html = desk.read(a.state.folder, 'report.html')
  assert.doesNotMatch(html, /55\.5/)
  assert.match(html, /41\.27/)
  assert.match(html, /write-up was thrown away/)
})

test('no roster snapshot: the crew is told, and the run goes on from the league files', async () => {
  const { a, calls } = crew({}, { snapshot: { missing: 'gcloud login expired' } })
  assert.equal(await a.ask('q'), 0)
  assert.equal(a.state.snapshot, null)
  assert.match(calls[0].prompt, /players\.json` is MISSING/)
  assert.match(a.state.log.join('\n'), /could NOT be read \(gcloud login expired\)/)
})

test('signed out: it stops before hiring anyone', async () => {
  const { a, kinds } = crew({}, { preflight() { throw new (class extends Error {})('nope') } })
  assert.equal(await a.ask('q'), 1)
  assert.deepEqual(kinds(), [])
})

test('the report escapes what the crew wrote', () => {
  const html = reportHtml({ id: 'x', question: '<script>alert(1)</script>', status: 'done', log: [], plan: PLAN, result: { facts: [{ label: '<b>x</b>', value: 1 }], tables: [] }, words: { headline: '<img src=x>', paragraphs: ['p'] }, openProblems: [], snapshot: null })
  assert.doesNotMatch(html, /<script>alert|<img src=x>|<b>x<\/b>/)
})

test('an answer becomes a build request with its calculation attached', () => {
  const dir = mkdtempSync(join(tmpdir(), 'answers-'))
  mkdirSync(join(dir, 'a1'))
  writeFileSync(join(dir, 'a1/state.json'), JSON.stringify({ id: 'a1', status: 'done', question: 'WR scores vs M. Zurek', plan: PLAN }))
  writeFileSync(join(dir, 'a1/calc.mjs'), CALC)
  const got = answerForBuild(dir, 'a1')
  assert.match(got.request, /for the whole league: "WR scores vs M\. Zurek"/)
  assert.equal(got.attach['calc.mjs'], CALC)
  assert.match(got.attach['method.md'], /Add up started WR points/)
  assert.throws(() => answerForBuild(dir, 'nope'), /no answer called nope/)
  writeFileSync(join(dir, 'a1/state.json'), JSON.stringify({ id: 'a1', status: 'stopped' }))
  assert.throws(() => answerForBuild(dir, 'a1'), /never finished/)
})

test('the real sandbox blocks a write, the network and a read outside the folder', { skip: process.platform !== 'darwin' }, () => {
  const folder = mkdtempSync(join(tmpdir(), 'seal-'))
  writeFileSync(join(folder, 'calc.mjs'), `import { readFileSync, writeFileSync } from 'node:fs'
let w = 'blocked', n = 'blocked', r = 'blocked'
try { writeFileSync('x.txt', 'hi'); w = 'WROTE' } catch {}
try { await fetch('https://example.com'); n = 'NET' } catch {}
try { readFileSync(${JSON.stringify(join(process.env.HOME, '.zshrc'))}); r = 'READ' } catch {}
console.log(JSON.stringify({ w, n, r, self: readFileSync('calc.mjs', 'utf8').length > 0 }))`)
  assert.deepEqual(JSON.parse(realDesk().run(folder)), { w: 'blocked', n: 'blocked', r: 'blocked', self: true })
  assert.equal(readFileSync(join(folder, 'calc.mjs'), 'utf8').length > 0, true)
})

// The keeper question's first real run died here: answers live under the home
// folder, and Node could not even find calc.mjs with every folder above it denied.
test('the real sandbox runs a calculation that lives under the home folder', { skip: process.platform !== 'darwin' || !HERE.startsWith(process.env.HOME ?? '\0') }, () => {
  mkdirSync(join(HERE, '../../out'), { recursive: true })
  const folder = mkdtempSync(join(HERE, '../../out/seal-'))
  try {
    writeFileSync(join(folder, 'calc.mjs'), `import { readFileSync, readdirSync } from 'node:fs'
let r = 'blocked', l = 'blocked'
try { readFileSync(${JSON.stringify(join(process.env.HOME, '.zshrc'))}); r = 'READ' } catch {}
try { readdirSync(${JSON.stringify(process.env.HOME)}); l = 'LISTED' } catch {}
console.log(JSON.stringify({ r, l }))`)
    assert.deepEqual(JSON.parse(realDesk().run(folder)), { r: 'blocked', l: 'blocked' })
  } finally { rmSync(folder, { recursive: true, force: true }) }
})
