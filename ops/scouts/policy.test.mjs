import test from 'node:test'
import assert from 'node:assert/strict'
import { checkDiff, parseGitDiff, LIMITS } from './policy.mjs'

const f = (path, added = 10, deleted = 0, status = 'M') => ({ path, added, deleted, status })

test('an ordinary browser-app change is within bounds', () => {
  assert.deepEqual(checkDiff([f('web/src/components/RivalryChart.jsx', 120, 0, 'A'), f('web/src/services/rivalry.js', 60, 0, 'A'),
    f('web/src/services/rivalry.test.js', 40, 0, 'A'), f('web/src/views/DashboardView.jsx', 6, 1)]), [])
})

test('everything that decides who can read, write, run or deploy is off limits', () => {
  for (const p of ['firestore.rules', 'functions/index.js', 'ops/espn-weekly.sh', '.github/workflows/deploy.yml', 'CLAUDE.md',
    'web/package.json', 'web/package-lock.json', 'web/.env', 'web/src/services/firestoreService.js', 'web/src/context/AppContext.jsx',
    'web/src/views/AdminView.jsx', 'web/scripts/import-history.mjs', 'data/trades-2025-on.csv', 'firebase.json']) {
    assert.equal(checkDiff([f(p)]).length, 1, p)
  }
})

test('paths that try to climb out are refused', () => {
  assert.match(checkDiff([f('web/src/../../firestore.rules')])[0], /escapes/)
  assert.match(checkDiff([f('/etc/hosts')])[0], /escapes/)
})

test('no deleting files, and no gutting an existing test to get to green', () => {
  assert.match(checkDiff([f('web/src/components/OddsBoard.jsx', 0, 200, 'D')])[0], /may not delete/)
  assert.match(checkDiff([f('web/src/services/playoffs.test.js', 2, 40)])[0], /lost more lines/)
  assert.deepEqual(checkDiff([f('web/src/services/playoffs.test.js', 30, 4)]), [])
})

test('size limits, and an empty change is not a change', () => {
  const many = Array.from({ length: LIMITS.maxFiles + 1 }, (_, i) => f(`web/src/components/X${i}.jsx`, 1))
  assert.ok(checkDiff(many).some((v) => /files changed/.test(v)))
  assert.ok(checkDiff([f('web/src/components/Big.jsx', LIMITS.maxLines + 1)]).some((v) => /lines changed/.test(v)))
  assert.deepEqual(checkDiff([]), ['no changes were made'])
})

test('parseGitDiff reads numstat + name-status, including binary files and renames', () => {
  const files = parseGitDiff('12\t3\tweb/src/a.js\n-\t-\tweb/src/logo.png\n5\t0\tweb/src/new.js\n', 'M\tweb/src/a.js\nA\tweb/src/logo.png\nA\tweb/src/new.js\n')
  assert.deepEqual(files, [
    { path: 'web/src/a.js', added: 12, deleted: 3, status: 'M' },
    { path: 'web/src/logo.png', added: 0, deleted: 0, status: 'A' },
    { path: 'web/src/new.js', added: 5, deleted: 0, status: 'A' },
  ])
})
