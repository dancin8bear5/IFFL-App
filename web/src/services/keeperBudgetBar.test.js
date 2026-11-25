import { test } from 'node:test'
import assert from 'node:assert/strict'
import { keeperBudgetBar } from './keeperBudgetBar.js'

const OPTS = { budget: 200, cap: 300 }

test('zero cost fills nothing', () => {
  const { fillPct } = keeperBudgetBar(0, OPTS)
  assert.equal(fillPct, 0)
})

test('cost at the budget lands fill and tick at the same spot', () => {
  const { fillPct, tickPct } = keeperBudgetBar(200, OPTS)
  assert.equal(fillPct, (200 / 300) * 100)
  assert.equal(tickPct, (200 / 300) * 100)
})

test('cost under the budget fills less than the tick', () => {
  const { fillPct, tickPct } = keeperBudgetBar(100, OPTS)
  assert.ok(fillPct < tickPct)
})

test('cost at the cap fills the whole bar', () => {
  const { fillPct } = keeperBudgetBar(300, OPTS)
  assert.equal(fillPct, 100)
})

test('cost past the cap clamps instead of overflowing', () => {
  const { fillPct } = keeperBudgetBar(350, OPTS)
  assert.equal(fillPct, 100)
})

test('the tick position never moves with cost — it only depends on the budget', () => {
  assert.equal(keeperBudgetBar(0, OPTS).tickPct, keeperBudgetBar(350, OPTS).tickPct)
})
