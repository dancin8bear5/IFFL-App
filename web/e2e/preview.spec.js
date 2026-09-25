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
