// Pre-deploy smoke: render the signed-in app on sample data, every phase.
import { test, expect } from '@playwright/test'

// The app shell's brand line — present on phone (header) and desktop (chip).
const ready = (page) => page.getByText(/EST\. 2008/).first()

const PHASES = ['preseason', 'regular', 'playoffs', 'dead', 'offseason']

function watchErrors(page) {
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    const t = m.text()
    // Preview has no Firebase project behind it; network/auth noise is expected.
    if (/firebase|firestore|auth\/|Failed to load resource|ERR_|net::/i.test(t)) return
    errors.push(`console: ${t}`)
  })
  return errors
}

for (const phase of PHASES) {
  test(`dashboard renders — ${phase}`, async ({ page }) => {
    const errors = watchErrors(page)
    await page.goto(`/?preview=1&phase=${phase}#dashboard`)
    await expect(ready(page)).toBeVisible({ timeout: 15_000 })
    // No error boundary tripped anywhere on the page.
    await expect(page.getByText(/something went wrong|failed to render/i)).toHaveCount(0)
    expect(errors, errors.join('\n')).toEqual([])
  })
}

test('past-season standings never appear on the Dashboard', async ({ page }) => {
  for (const phase of PHASES) {
    await page.goto(`/?preview=1&phase=${phase}#dashboard`)
    await expect(ready(page)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/^20(0\d|1\d|2[0-5]) Standings$/)).toHaveCount(0)
  }
})

test('League History opens', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/?preview=1#history')
  await expect(page.getByText(/League History/i).first()).toBeVisible({ timeout: 15_000 })
  expect(errors, errors.join('\n')).toEqual([])
})

test('phone width has no horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?preview=1&phase=regular#dashboard')
  await expect(ready(page)).toBeVisible({ timeout: 15_000 })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)
})

// Team-name links and column-sort buttons are the main way to follow a row
// on phone — a bare <a> or <button> with no padding is often under 14px
// tall, so a tap lands on the row above or below instead (Nov 25, 2026).
async function tapTargetBoxes(page, selector) {
  const boxes = []
  for (const el of await page.locator(selector).all()) {
    if (!(await el.isVisible())) continue
    const box = await el.boundingBox()
    if (box) boxes.push(box)
  }
  return boxes
}

function expectRealTapTargets(boxes) {
  expect(boxes.length).toBeGreaterThan(0)
  for (const box of boxes) {
    expect(box.height).toBeGreaterThanOrEqual(32)
    expect(box.width).toBeGreaterThanOrEqual(32)
  }
}

test('phone tap targets: team links and sort buttons are at least 32px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })

  await page.goto('/?preview=1#history')
  await expect(page.getByText(/League History/i).first()).toBeVisible({ timeout: 15_000 })
  expectRealTapTargets(await tapTargetBoxes(page, '.team-link'))

  await page.goto('/?preview=1#players')
  await expect(page.getByText('Players', { exact: true }).first()).toBeVisible({ timeout: 15_000 })
  expectRealTapTargets(await tapTargetBoxes(page, '.th-sort'))

  await page.goto('/?preview=1#rosters')
  await expect(page.getByText('Rosters', { exact: true }).first()).toBeVisible({ timeout: 15_000 })
  // The sort toggle only shows in All Assets mode — By Team has no columns to sort.
  await page.getByText('All Assets', { exact: true }).first().click()
  expectRealTapTargets(await tapTargetBoxes(page, '.th-sort'))
})

test('Admin → Notes renders the approval queue', async ({ page }) => {
  const errors = watchErrors(page)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/?preview=1#admin')
  await page.getByText('Notes', { exact: true }).first().click({ timeout: 15_000 })
  await expect(page.getByText('Week 3 recap', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Approve & schedule' })).toBeVisible()
  await expect(page.getByText(/Numbers not in the data/)).toBeVisible()
  await page.screenshot({ path: 'test-results/admin-notes.png', fullPage: true })
  expect(errors, errors.join('\n')).toEqual([])
})
