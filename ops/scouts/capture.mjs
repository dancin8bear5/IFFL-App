#!/usr/bin/env node
// capture — what the app looks and behaves like right now, for the scouts.
//
// Starts the dev server in ?preview=1 (sample data, no sign-in — so no
// member data ever reaches a screenshot), visits every page at phone and
// desktop width, and writes:
//
//   <out>/shots/<page>-<size>.png      what the visuals scout looks at
//   <out>/report.json                  what the usability scout reads:
//                                      load time, console errors, sideways
//                                      scroll, unnamed buttons, small tap targets
//
//   node ops/scouts/capture.mjs --web <web dir> --out <dir> [--pages dashboard,rosters] [--port 5197]
//
// Read-only: it never clicks anything that writes, and preview mode has no
// database connection to write to.
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

export const PAGES = ['dashboard', 'rosters', 'players', 'trades', 'worksheet', 'history', 'power-rankings', 'archive']
export const SIZES = { phone: { width: 390, height: 844 }, desktop: { width: 1280, height: 800 } }

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : dflt }

/** Runs in the page. Numbers only — no page text leaves the browser. */
export function measure() {
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 }
  const buttons = [...document.querySelectorAll('button, a[href], [role="button"]')].filter(vis)
  const name = (el) => (el.getAttribute('aria-label') || el.innerText || el.title || '').trim()
  return {
    sidewaysScroll: document.documentElement.scrollWidth > window.innerWidth + 1,
    pageHeight: document.documentElement.scrollHeight,
    buttons: buttons.length,
    unnamedButtons: buttons.filter((b) => !name(b)).length,
    smallTapTargets: buttons.filter((b) => { const r = b.getBoundingClientRect(); return r.width < 32 || r.height < 32 }).length,
    textUnder11px: [...document.querySelectorAll('body *')].filter((el) => vis(el) && el.children.length === 0 && el.innerText?.trim()
      && parseFloat(getComputedStyle(el).fontSize) < 11).length,
  }
}

async function waitForServer(url, ms = 30000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    try { if ((await fetch(url)).ok) return } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error(`dev server did not start at ${url}`)
}

export async function capture({ web, out, pages = PAGES, port = 5197 }) {
  // Playwright lives in the web app's node_modules, wherever that is.
  const { chromium } = createRequire(join(resolve(web), 'package.json'))('@playwright/test')
  mkdirSync(join(out, 'shots'), { recursive: true })
  const server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { cwd: web, stdio: 'ignore' })
  const base = `http://localhost:${port}`
  const report = { takenAt: new Date().toISOString(), pages: [] }
  let browser
  try {
    await waitForServer(base)
    browser = await chromium.launch()
    for (const [size, viewport] of Object.entries(SIZES)) {
      const ctx = await browser.newContext({ viewport, colorScheme: 'dark' })
      for (const slug of pages) {
        const page = await ctx.newPage()
        const errors = []
        page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)) })
        page.on('pageerror', (e) => errors.push(`uncaught: ${String(e.message).slice(0, 200)}`))
        const t0 = Date.now()
        let failed = null
        try {
          // 'load', not 'networkidle': the Dashboard keeps live listeners and
          // animations going, so the network never goes idle and every
          // capture of it timed out.
          await page.goto(`${base}/?preview=1#${slug}`, { waitUntil: 'load', timeout: 20000 })
        } catch (e) { failed = String(e.message).slice(0, 160) }
        const loadMs = Date.now() - t0
        if (!failed) {
          await page.waitForTimeout(2000)
          // The app scrolls inside its own container, so a "full page"
          // screenshot is one screen tall. Grow the window to the content
          // instead (capped — a 30,000px image helps nobody).
          const inner = await page.evaluate(() => Math.max(0, ...[...document.querySelectorAll('*')]
            .filter((el) => el.scrollHeight > el.clientHeight + 50 && /auto|scroll/.test(getComputedStyle(el).overflowY))
            .map((el) => el.scrollHeight))).catch(() => 0)
          if (inner > viewport.height) {
            await page.setViewportSize({ width: viewport.width, height: Math.min(inner + 80, 5000) })
            await page.waitForTimeout(400)
          }
        }
        const shot = `${slug}-${size}.png`
        const m = failed ? {} : await page.evaluate(measure).catch(() => ({}))
        if (!failed) await page.screenshot({ path: join(out, 'shots', shot), fullPage: true }).catch(() => {})
        // Preview mode has no sign-in, so permission errors from live
        // listeners are expected noise, not findings.
        const real = errors.filter((e) => !/insufficient permissions|permission-denied/i.test(e))
        report.pages.push({ page: slug, size, shot: failed ? null : `shots/${shot}`, loadMs, failed, consoleErrors: real, ...m })
        await page.close()
      }
      await ctx.close()
    }
  } finally {
    await browser?.close().catch(() => {})
    server.kill('SIGTERM')
  }
  writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2))
  return report
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const web = arg('--web'), out = arg('--out')
  if (!web || !out) { console.error('usage: capture.mjs --web <web dir> --out <dir> [--pages a,b] [--port N]'); process.exit(1) }
  capture({ web, out, pages: arg('--pages')?.split(','), port: Number(arg('--port', 5197)) })
    .then((r) => console.log(`captured ${r.pages.length} views → ${out}`), (e) => { console.error(e.message); process.exit(1) })
}
