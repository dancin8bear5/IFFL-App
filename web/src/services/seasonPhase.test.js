import { test } from 'node:test'
import assert from 'node:assert/strict'
import { milestones } from '../data/staticData.js'
import {
  PHASES, FALLBACK_PHASE, phaseAnchors, phaseFor, resolvePhase, inPhase,
  phaseBounds, nextMilestone, isOffSeasonPhase,
} from './seasonPhase.js'

const d = (y, m, day) => new Date(y, m, day)

test('the real calendar carries exactly five boundaries, in order', () => {
  const a = phaseAnchors(milestones)
  assert.ok(a, 'the shipped calendar must be a valid phase model')
  assert.deepEqual(a.map((x) => x.phase), PHASES)
})

test('one date inside each of the five phases', () => {
  assert.equal(phaseFor(d(2026, 6, 20), milestones), 'preseason')   // Jul 20
  assert.equal(phaseFor(d(2026, 9, 4), milestones), 'regular')      // Oct 4
  assert.equal(phaseFor(d(2026, 11, 20), milestones), 'playoffs')   // Dec 20
  assert.equal(phaseFor(d(2027, 0, 20), milestones), 'dead')        // Jan 20
  assert.equal(phaseFor(d(2027, 3, 1), milestones), 'offseason')    // Apr 1
})

test('the boundaries themselves belong to the phase they open', () => {
  assert.equal(phaseFor(d(2026, 6, 16), milestones), 'preseason')
  assert.equal(phaseFor(d(2026, 8, 9), milestones), 'regular')
  assert.equal(phaseFor(d(2026, 11, 16), milestones), 'playoffs')
  assert.equal(phaseFor(d(2027, 0, 6), milestones), 'dead')
  assert.equal(phaseFor(d(2027, 1, 15), milestones), 'offseason')
  // and the day before each is still the previous phase
  assert.equal(phaseFor(d(2026, 8, 8), milestones), 'preseason')
  assert.equal(phaseFor(d(2027, 0, 5), milestones), 'playoffs')
  assert.equal(phaseFor(d(2027, 1, 14), milestones), 'dead')
})

test('the cycle closes: every day of a year lands in exactly one phase', () => {
  // Walk 400 days from the start of the written cycle. Every day must
  // resolve, and the sequence must only ever move FORWARD through PHASES
  // (wrapping once) — a gap or an overlap shows up as a backwards step.
  let prev = phaseFor(d(2026, 6, 16), milestones)
  let wraps = 0
  for (let i = 1; i <= 400; i++) {
    const day = new Date(2026, 6, 16 + i)
    const p = phaseFor(day, milestones)
    assert.ok(PHASES.includes(p), `${day.toDateString()} → ${p}`)
    if (p !== prev) {
      const step = PHASES.indexOf(p) - PHASES.indexOf(prev)
      if (step !== 1) {
        assert.equal(step, -(PHASES.length - 1), `bad transition ${prev}→${p} on ${day.toDateString()}`)
        wraps++
      }
      prev = p
    }
  }
  assert.equal(wraps, 1, 'the year should wrap exactly once')
})

test('the New Year wrap holds — three phases straddle it', () => {
  assert.equal(phaseFor(d(2026, 11, 31), milestones), 'playoffs')
  assert.equal(phaseFor(d(2027, 0, 1), milestones), 'playoffs')
  assert.equal(phaseFor(d(2027, 0, 6), milestones), 'dead')
})

test('dates outside the written cycle still resolve, by repeating it', () => {
  // A year earlier and a year later than anything on the calendar.
  assert.equal(phaseFor(d(2025, 9, 4), milestones), 'regular')
  assert.equal(phaseFor(d(2028, 3, 1), milestones), 'offseason')
  assert.equal(phaseFor(d(2027, 6, 20), milestones), 'preseason')
})

test('a moving Super Bowl moves the off-season with it', () => {
  // Same calendar, different SB year: the boundary is data, not a constant.
  const late = milestones.map((m) =>
    m.phase === 'offseason' ? { ...m, date: d(2027, 1, 22) } : m)
  assert.equal(phaseFor(d(2027, 1, 18), milestones), 'offseason')
  assert.equal(phaseFor(d(2027, 1, 18), late), 'dead')
  assert.equal(phaseFor(d(2027, 1, 22), late), 'offseason')
})

test('a broken calendar degrades to the closed league, never to open', () => {
  assert.equal(phaseAnchors([]), null)
  assert.equal(phaseFor(new Date(), []), FALLBACK_PHASE)
  assert.equal(phaseFor(new Date(), null), FALLBACK_PHASE)
  // a phase declared twice
  assert.equal(phaseAnchors([...milestones, { name: 'x', phase: 'regular', date: d(2026, 5, 1) }]), null)
  // one missing
  assert.equal(phaseAnchors(milestones.filter((m) => m.phase !== 'dead')), null)
  // present but out of order
  const scrambled = milestones.map((m) =>
    m.phase === 'playoffs' ? { ...m, date: d(2026, 6, 1) } : m)
  assert.equal(phaseAnchors(scrambled), null)
  assert.equal(phaseFor(d(2026, 9, 1), scrambled), FALLBACK_PHASE)
  // an unparseable date
  assert.equal(phaseFor(new Date('nope'), milestones), FALLBACK_PHASE)
})

test('an override wins; junk falls through to the calendar', () => {
  const oct = d(2026, 9, 4)
  assert.equal(resolvePhase(oct, milestones, 'offseason'), 'offseason')
  assert.equal(resolvePhase(oct, milestones, ''), 'regular')
  assert.equal(resolvePhase(oct, milestones, null), 'regular')
  assert.equal(resolvePhase(oct, milestones, 'banana'), 'regular')
})

test('no declaration means every phase', () => {
  assert.equal(inPhase(undefined, 'regular'), true)
  assert.equal(inPhase([], 'regular'), true)
  assert.equal(inPhase(['preseason', 'offseason'], 'offseason'), true)
  assert.equal(inPhase(['preseason', 'offseason'], 'regular'), false)
})

test('phaseBounds says what is running and what is next', () => {
  const b = phaseBounds(d(2026, 9, 4), milestones)
  assert.equal(b.phase, 'regular')
  assert.equal(b.next, 'playoffs')
  assert.equal(b.start.getTime(), d(2026, 8, 9).getTime())
  assert.equal(b.end.getTime(), d(2026, 11, 16).getTime())
  assert.equal(b.daysLeft, 73)
  assert.equal(phaseBounds(new Date(), []), null)
})

test('nextMilestone finds the next event and never runs dry', () => {
  assert.equal(nextMilestone(d(2026, 8, 10), milestones).name, 'Trade Deadline')
  // Past the end of the written calendar it repeats rather than returning null.
  assert.ok(nextMilestone(d(2027, 5, 1), milestones))
  assert.equal(nextMilestone(new Date('nope'), milestones), null)
})

test('isOffSeason keeps the meaning its six readers already had', () => {
  assert.equal(isOffSeasonPhase('offseason'), true)
  assert.equal(isOffSeasonPhase('dead'), true)
  assert.equal(isOffSeasonPhase('preseason'), false)
  assert.equal(isOffSeasonPhase('regular'), false)
  assert.equal(isOffSeasonPhase('playoffs'), false)
})
