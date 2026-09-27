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

// The check that was missing on Sep 26, 2026, when a deploy shipped an API
// key Firebase rejected and every gate stayed green: the login screen renders
// whatever the key says, so "the page loads" proves nothing about auth.
//
// Signing in with credentials that cannot exist asks Google the one question
// that matters — is this key real? A working key answers "wrong email or
// password" (or rate-limits); a broken one answers api-key-not-valid, which is
// what the league saw. No secrets needed, so this runs on every deploy, and it
// creates nothing.
test('the deployed Firebase key is real — auth answers', async ({ page }) => {
  await page.goto('/')
  await page.getByPlaceholder('Email').fill('no-such-user@iffl.invalid')
  await page.getByPlaceholder('Password').fill('not-a-real-password')
  await page.getByRole('button', { name: 'Sign in with Email' }).click()

  const message = page.getByTestId('auth-error')
  await expect(message).toBeVisible({ timeout: 20_000 })
  const text = await message.innerText()

  // Two ways this is a failure, and the second one matters as much as the
  // first: an api-key error is the bug, and a network error means the
  // question never reached Google, so a pass would prove nothing. Anything
  // else — wrong credentials, no such user, rate-limited — is Identity
  // Toolkit answering, which is the whole point.
  expect(text, `sign-in returned "${text}"`).not.toMatch(/api.?key/i)
  expect(text, `could not reach Firebase auth: "${text}"`).not.toMatch(/network-request-failed/i)
})

// ── Signed in, as the read-only smoke account (config/league.smokeUIDs) ──
// Secrets SMOKE_EMAIL / SMOKE_PASSWORD. Without them this block skips, so a
// fork or a local run never fails for want of credentials. The account can
// read what a member reads and write nothing (firestore.rules isSmoke()).
const SMOKE_EMAIL = process.env.SMOKE_EMAIL
const SMOKE_PASSWORD = process.env.SMOKE_PASSWORD

test.describe('signed in', () => {
  test.skip(!SMOKE_EMAIL || !SMOKE_PASSWORD, 'SMOKE_EMAIL / SMOKE_PASSWORD not set')

  test('dashboard loads with no permission errors', async ({ page }) => {
    const errors = []
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
    page.on('console', (m) => {
      // A missing or wrong rule shows up here — exactly what this test is for.
      if (m.type() === 'error' && /permission|insufficient|denied/i.test(m.text())) errors.push(`console: ${m.text()}`)
    })
    await page.goto('/')
    await page.getByPlaceholder('Email').fill(SMOKE_EMAIL)
    await page.getByPlaceholder('Password').fill(SMOKE_PASSWORD)
    await page.getByRole('button', { name: 'Sign in with Email' }).click()
    await expect(page.getByText(/EST\. 2008/).first()).toBeVisible({ timeout: 30_000 })
    await page.waitForLoadState('networkidle')
    // Visit History for its Firestore reads, but don't require the tab: an
    // Admin → Areas switch can hide it from non-admins (the smoke account is
    // one), and a hidden tab is correct behaviour, not a failure. What must
    // hold everywhere is "no permission errors".
    await page.goto('/#history')
    await page.waitForLoadState('networkidle')
    expect(errors, errors.join('\n')).toEqual([])
  })
})
