import test from 'node:test'
import assert from 'node:assert/strict'
import { format } from './report.mjs'

const green = { TEST: 'success', DEPLOY: 'success', SMOKE: 'success', HEALTH: 'success', SHA: 'abcdef123', MSG: 'Ship it\nbody' }

test('all green', () => {
  const r = format(green)
  assert.equal(r.ok, true)
  assert.match(r.text, /^🟢 IFFL deploy · abcdef1 · Ship it/)
  assert.doesNotMatch(r.text, /❌/)
})

test('smoke fail + rollback is red and says so', () => {
  const r = format({ ...green, DEPLOY: 'failure', SMOKE: 'failure', ROLLED_BACK: 'true' })
  assert.equal(r.ok, false)
  assert.match(r.text, /❌ live smoke/)
  assert.match(r.text, /auto-rolled back/)
  assert.match(r.text, /✅ deploy/, 'the deploy itself happened')
})

test('test failure never shows a deploy', () => {
  const r = format({ TEST: 'failure', DEPLOY: 'skipped', SHA: 'x' })
  assert.match(r.text, /❌ tests/)
  assert.match(r.text, /⏭ deploy/)
})
