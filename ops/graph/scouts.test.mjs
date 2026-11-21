import test from 'node:test'
import assert from 'node:assert/strict'
import { levels, validate } from './runner.mjs'
import { scoutsGraph, SCOUTS, claudeArgs, parseClaude, historyText, ideaText, prBody, summarize, models } from './scouts.mjs'

test('the graph is valid: three independent chains between shared ends', () => {
  const g = scoutsGraph({ date: '2026-11-25' })
  assert.ok(validate(g))
  const waves = levels(g)
  assert.deepEqual(waves[0], ['preflight'])
  assert.deepEqual(waves[2], SCOUTS.map((s) => `idea:${s}`))
  assert.deepEqual(waves.at(-1), ['digest'])
  // One chain failing must not be able to block another: no node needs another scout's node.
  for (const n of g.filter((x) => x.id.includes(':'))) {
    const mine = n.id.split(':')[1]
    for (const d of n.needs) if (d.includes(':')) assert.equal(d.split(':')[1], mine, `${n.id} needs ${d}`)
  }
})

test('--only narrows the graph to one scout', () => {
  const ids = scoutsGraph({ only: ['data'] }).map((n) => n.id)
  assert.ok(ids.includes('build:data'))
  assert.ok(!ids.some((id) => id.endsWith(':visuals') || id.endsWith(':usability')))
})

const schema = { type: 'object' }
test('the scout and the reviewer cannot edit or run anything; the builder can only edit and test', () => {
  const read = claudeArgs({ model: 'm', schema, edits: false, tools: ['Read', 'Grep', 'Glob'], budget: 3 })
  assert.equal(read[read.indexOf('--permission-mode') + 1], 'dontAsk')
  assert.equal(read[read.indexOf('--tools') + 1], 'Read,Grep,Glob')
  assert.ok(!read.includes('--allowedTools'))

  const build = claudeArgs({ model: 'm', schema, edits: true, tools: ['Read', 'Edit', 'Bash'], allowed: ['Bash(npm --prefix web test:*)'], budget: 10 })
  assert.equal(build[build.indexOf('--permission-mode') + 1], 'acceptEdits')
  assert.equal(build[build.indexOf('--max-budget-usd') + 1], '10.00')
  for (const args of [read, build]) {
    for (const must of ['--restricted', '--strict-mcp-config', '--no-session-persistence', 'Bash(git push:*)', 'Bash(git commit:*)', 'Bash(rm:*)', 'Read(**/.env)']) {
      assert.ok(args.includes(must), must)
    }
    assert.deepEqual(args.slice(args.indexOf('--permission-prompts'), args.indexOf('--permission-prompts') + 2), ['--permission-prompts', 'none'])
  }
})

test('parseClaude: structured answer, a JSON answer in prose, and the failures', () => {
  assert.deepEqual(parseClaude('noise\n' + JSON.stringify({ structured_output: { skip: true }, total_cost_usd: 0.4 })), { out: { skip: true }, cost: 0.4 })
  assert.deepEqual(parseClaude(JSON.stringify({ result: 'Here: {"verdict":"approve","reasons":[]}' })).out, { verdict: 'approve', reasons: [] })
  assert.throws(() => parseClaude('not json at all'), /not JSON/)
  assert.throws(() => parseClaude(JSON.stringify({ is_error: true, result: 'budget exceeded' })), /no usable answer/)
  assert.throws(() => parseClaude(JSON.stringify({ result: 'I could not decide.' })), /no usable answer/)
})

test('historyText tells a scout what was merged, what was closed and what is open', () => {
  const t = historyText([{ title: 'Rivalry sparkline', state: 'MERGED' }, { title: 'Confetti on wins', state: 'CLOSED' }, { title: 'Bigger tap targets', state: 'OPEN' }])
  assert.match(t, /MERGED[^\n]*:\n- Rivalry sparkline/)
  assert.match(t, /CLOSED WITHOUT MERGING[^\n]*:\n- Confetti on wins/)
  assert.match(t, /STILL OPEN:\n- Bigger tap targets/)
  assert.match(historyText([]), /MERGED[^\n]*: none yet/)
})

const idea = { title: 'Show trade winners', problem: 'Nobody can see who won a trade.', proposal: 'Add a card.', files: ['web/src/services/tradeWinners.js'], acceptance: ['Card shows 12 teams'] }
test('the pull request says a scout made it, how to check it, and what the reviewer flagged', () => {
  const body = prBody({ scout: 'data', idea, build: { summary: 'Added a card.', notes: '', rounds: 2, files: 3, lines: 140 }, review: { reasons: ['math traced on 2024 trades'], risk: 'Check the phone layout.' } })
  assert.match(body, /data scout/)
  assert.match(body, /- \[ \] Card shows 12 teams/)
  assert.match(body, /3 files, 140 lines/)
  assert.match(body, /after one repair round/)
  assert.match(body, /Look at this before merging\nCheck the phone layout\./)
  assert.match(ideaText(idea), /Problem: Nobody can see/)
})

test('summarize: one honest line per scout, whatever happened', () => {
  const st = { nodes: {
    'pr:visuals': { status: 'done', value: { url: 'https://github.com/x/y/pull/50', title: 't' } },
    'idea:usability': { status: 'done', value: { skip: true, reason: 'pull request #48 from this scout is still open' } },
    'pr:usability': { status: 'done', value: { skipped: true } },
    'idea:data': { status: 'done', value: { skip: false, title: 't' } },
    'review:data': { status: 'failed', error: 'reviewer rejected it: the math double-counts three-team trades' },
  } }
  const [v, u, d] = summarize(st)
  assert.match(v, /visuals: opened https:\/\/github.com\/x\/y\/pull\/50/)
  assert.match(u, /usability: no proposal — pull request #48/)
  assert.match(d, /data: stopped at review — reviewer rejected it/)
  assert.deepEqual(summarize({ nodes: {} }, ['data']), ['data: did not run'])
})

test('models: the reviewer is never the author\'s tier, and a missing tier map still yields two models', () => {
  const fallback = models('/nonexistent/models.json')
  assert.notEqual(fallback.author, fallback.reviewer)
  const real = models()
  assert.notEqual(real.author, real.reviewer)
})
