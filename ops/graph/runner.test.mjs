import test from 'node:test'
import assert from 'node:assert/strict'
import { runGraph, validate, levels, STATUS } from './runner.mjs'

const node = (id, needs = [], extra = {}) => ({ id, needs, run: async () => id.toUpperCase(), ...extra })
const boom = (msg = 'boom') => async () => { throw new Error(msg) }

test('levels: independent steps share a wave', () => {
  const g = [node('preflight'), node('scrape', ['preflight']), node('trades', ['scrape']), node('feed', ['scrape']), node('digest', ['trades', 'feed'])]
  assert.deepEqual(levels(g), [['preflight'], ['scrape'], ['trades', 'feed'], ['digest']])
})

test('validate refuses duplicates, unknown needs and cycles', () => {
  assert.throws(() => validate([node('a'), node('a')]), /duplicate/)
  assert.throws(() => validate([node('a', ['ghost'])]), /unknown node 'ghost'/)
  assert.throws(() => validate([node('a', ['b']), node('b', ['a'])]), /cycle/)
  assert.throws(() => validate([{ id: 'a' }]), /run\(\)/)
})

test('runs in dependency order and hands results forward', async () => {
  const order = []
  const g = [
    { id: 'a', run: async () => { order.push('a'); return 2 } },
    { id: 'b', needs: ['a'], run: async ({ results }) => { order.push('b'); return results.a * 21 } },
  ]
  const r = await runGraph(g)
  assert.equal(r.ok, true)
  assert.deepEqual(order, ['a', 'b'])
  assert.equal(r.results.b, 42)
})

test('siblings really run side by side', async () => {
  let running = 0, peak = 0
  const slow = (id) => ({ id, needs: ['root'], run: async () => { running++; peak = Math.max(peak, running); await new Promise((r) => setTimeout(r, 10)); running-- } })
  await runGraph([node('root'), slow('x'), slow('y'), slow('z')])
  assert.equal(peak, 3)
})

test('a failed branch blocks what needs it and spares its siblings', async () => {
  const g = [node('root'), node('bad', ['root'], { run: boom() }), node('good', ['root']), node('after-bad', ['bad']), node('after-good', ['good'])]
  const r = await runGraph(g)
  assert.equal(r.ok, false)
  const s = (id) => r.state.nodes[id].status
  assert.deepEqual([s('bad'), s('good'), s('after-bad'), s('after-good')], [STATUS.failed, STATUS.done, STATUS.blocked, STATUS.done])
  assert.match(r.state.nodes['after-bad'].error, /blocked by bad/)
})

test('an optional step failing does not block the step that needs it', async () => {
  const g = [node('trades', [], { run: boom(), optional: true }), node('commit', ['trades'])]
  const r = await runGraph(g)
  assert.equal(r.ok, true)
  assert.equal(r.state.nodes.commit.status, STATUS.done)
  assert.equal(r.state.nodes.trades.status, STATUS.failed)
})

test('resume: finished steps are not repeated, failed ones are', async () => {
  const calls = []
  let fail = true
  const g = [
    { id: 'scrape', run: async () => { calls.push('scrape'); return 'week 11' } },
    { id: 'push', needs: ['scrape'], run: async ({ results }) => { calls.push('push'); if (fail) throw new Error('offline'); return results.scrape } },
    { id: 'digest', needs: ['push'], run: async () => { calls.push('digest') } },
  ]
  let saved
  const first = await runGraph(g, { save: async (s) => { saved = JSON.parse(JSON.stringify(s)) } })
  assert.equal(first.ok, false)
  fail = false
  const second = await runGraph(g, { state: saved })
  assert.equal(second.ok, true)
  assert.deepEqual(calls, ['scrape', 'push', 'push', 'digest'])
  assert.equal(second.results.push, 'week 11', 'a resumed step still sees the earlier result')
})

test('resume: an `always` step runs again even though it passed', async () => {
  let n = 0
  const g = [{ id: 'preflight', always: true, run: async () => ++n }, node('work', ['preflight'])]
  const first = await runGraph(g)
  await runGraph(g, { state: first.state })
  assert.equal(n, 2)
})

test('retry: waits as told, then succeeds; gives up when told to stop', async () => {
  const waits = []
  let tries = 0
  const g = [{ id: 'scrape', run: async () => { if (++tries < 3) throw new Error('not final'); return 'ok' }, retry: (e, attempt) => (attempt < 5 ? 1000 * attempt : null) }]
  const r = await runGraph(g, { sleep: async (ms) => { waits.push(ms) } })
  assert.equal(r.ok, true)
  assert.deepEqual(waits, [1000, 2000])
  assert.equal(r.state.nodes.scrape.attempts, 3)

  const stop = await runGraph([{ id: 'x', run: boom('logged out'), retry: () => null }], { sleep: async () => assert.fail('must not wait') })
  assert.equal(stop.ok, false)
  assert.equal(stop.state.nodes.x.error, 'logged out')
})

test('state is saved after every wave, so a crash mid-run loses one wave at most', async () => {
  const saves = []
  await runGraph([node('a'), node('b', ['a']), node('c', ['b'])], { save: async (s) => { saves.push(Object.keys(s.nodes).length) } })
  assert.deepEqual(saves, [1, 2, 3, 3])
})
