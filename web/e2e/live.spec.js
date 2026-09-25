// Post-deploy smoke against the real site (signed out). A failure here
// triggers the rollback step in .github/workflows/deploy.yml.
import { test, expect } from '@playwright/test'

test('site serves and the login screen renders', async ({ page }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  const res = await page.goto('/')
  expect(res?.status()).toBe(200)
  await expect(page.getByText('Sign in with Google')).toBeVisible({ timeout: 20_000 })
  expect(errors, errors.join('\n')).toEqual([])
})

test('every script and stylesheet on the page loads', async ({ page }) => {
  const bad = []
  page.on('response', (r) => {
    if (/\.(js|css)(\?|$)/.test(r.url()) && r.status() >= 400) bad.push(`${r.status()} ${r.url()}`)
  })
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  expect(bad).toEqual([])
})

test('privacy policy is still served', async ({ request }) => {
  const r = await request.get('/privacy.html')
  expect(r.status()).toBe(200)
})

test('SPA rewrite: a deep link returns the app, not a 404', async ({ request }) => {
  const r = await request.get('/some/deep/link')
  expect(r.status()).toBe(200)
  expect(await r.text()).toContain('<div id="root"')
})
