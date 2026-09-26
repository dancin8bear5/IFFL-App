// Firestore rules semantics, against the emulator (CI: deploy.yml).
// The static "does every collection HAVE a rule" check lives in
// web/src/services/rulesCoverage.test.js and runs anywhere.
import test, { before, after, beforeEach } from 'node:test'
import { readFileSync } from 'node:fs'
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'

let env
const MEMBER = 'member-uid'
const OUTSIDER = 'outsider-uid'
const COMMISH = 'commish-uid'
const SMOKE = 'smoke-uid'

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-iffl',
    firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') },
  })
})
after(() => env?.cleanup())

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'config/league'), {
      userTeamMap: { [MEMBER]: 'Bill' },
      authorizedUIDs: [COMMISH],
      smokeUIDs: [SMOKE],
      activeSeasonYear: 2026,
    })
    for (const p of ['espnLiveScores/2026', 'espnStandings/2026', 'weeklyScores/2026', 'leagueHistory/2025']) {
      await setDoc(doc(db, p), { season: 2026 })
    }
    await setDoc(doc(db, 'leagueNotes/draft1'), { status: 'draft', body: 'secret' })
    await setDoc(doc(db, 'leagueNotes/sent1'), { status: 'sent', body: 'hello league' })
  })
})

const as = (uid) => env.authenticatedContext(uid).firestore()
const anon = () => env.unauthenticatedContext().firestore()

// config/league is deliberately readable by ANY signed-in user — the client
// reads it at first login to resolve membership, before it has a team.
test('any signed-in user reads config/league (membership lookup)', () => assertSucceeds(getDoc(doc(as(OUTSIDER), 'config/league'))))
test('signed-out cannot read config/league', () => assertFails(getDoc(doc(anon(), 'config/league'))))

for (const path of ['espnLiveScores/2026', 'espnStandings/2026', 'weeklyScores/2026', 'leagueHistory/2025']) {
  test(`member reads ${path}`, () => assertSucceeds(getDoc(doc(as(MEMBER), path))))
  test(`outsider cannot read ${path}`, () => assertFails(getDoc(doc(as(OUTSIDER), path))))
  test(`signed-out cannot read ${path}`, () => assertFails(getDoc(doc(anon(), path))))
}

for (const path of ['espnLiveScores/2026', 'espnStandings/2026']) {
  test(`no client writes ${path} — functions only`, async () => {
    await assertFails(setDoc(doc(as(MEMBER), path), { hacked: true }))
    await assertFails(setDoc(doc(as(COMMISH), path), { hacked: true }))
  })
}

test('member cannot rewrite league config', () =>
  assertFails(updateDoc(doc(as(MEMBER), 'config/league'), { activeSeasonYear: 1999 })))

// ── League notes (agent #3): drafts are commissioner-only ──
test('member cannot read a draft note', () => assertFails(getDoc(doc(as(MEMBER), 'leagueNotes/draft1'))))
test('member reads a sent note', () => assertSucceeds(getDoc(doc(as(MEMBER), 'leagueNotes/sent1'))))
test('commissioner reads a draft note', () => assertSucceeds(getDoc(doc(as(COMMISH), 'leagueNotes/draft1'))))
test('commissioner can approve a draft', () =>
  assertSucceeds(updateDoc(doc(as(COMMISH), 'leagueNotes/draft1'), { status: 'approved', sendAt: new Date() })))
test('NO client can mark a note sent — only the sender function', async () => {
  await assertFails(updateDoc(doc(as(COMMISH), 'leagueNotes/draft1'), { status: 'sent' }))
  await assertFails(updateDoc(doc(as(MEMBER), 'leagueNotes/draft1'), { status: 'approved' }))
})

test('approving without a send time is refused', () =>
  assertFails(updateDoc(doc(as(COMMISH), 'leagueNotes/draft1'), { status: 'approved' })))
test('a sent note cannot be edited by anyone', () =>
  assertFails(updateDoc(doc(as(COMMISH), 'leagueNotes/sent1'), { status: 'draft' })))
test('clients cannot create notes', () =>
  assertFails(setDoc(doc(as(COMMISH), 'leagueNotes/new1'), { status: 'draft', body: 'x' })))

// ── Deploy agent's smoke account: reads everything a member reads, writes nothing ──
for (const path of ['espnStandings/2026', 'weeklyScores/2026', 'leagueHistory/2025', 'leagueNotes/sent1']) {
  test(`smoke account reads ${path}`, () => assertSucceeds(getDoc(doc(as(SMOKE), path))))
}
test('smoke account cannot read a draft note', () => assertFails(getDoc(doc(as(SMOKE), 'leagueNotes/draft1'))))
test('smoke account cannot propose a trade', () =>
  assertFails(setDoc(doc(as(SMOKE), 'trades/t1'), { status: 'proposed', proposingTeamName: 'Bill', receivingTeamName: 'Ryan' })))
test('smoke account cannot propose a rule', () =>
  assertFails(setDoc(doc(as(SMOKE), 'rules/r1'), { status: 'proposed', title: 'x' })))
test('smoke account cannot write FMK signals', () =>
  assertFails(setDoc(doc(as(SMOKE), 'playerFMK/f1'), { userId: SMOKE, signal: 'F' })))
test('smoke account cannot write league config', () =>
  assertFails(updateDoc(doc(as(SMOKE), 'config/league'), { activeSeasonYear: 1999 })))
