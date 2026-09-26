// Two suites, two targets:
//   preview — `vite dev` + ?preview=1 (sample data, no sign-in). Runs BEFORE
//             deploy; it's the only way to render the signed-in app in CI.
//   live    — the deployed site (SMOKE_URL). Runs AFTER deploy. Signed-out
//             only: ?preview is dev-build-only and can never activate there.
import { defineConfig } from '@playwright/test'

const exe = process.env.PW_CHROMIUM // sandbox override; CI uses the bundled browser
const use = { ...(exe ? { launchOptions: { executablePath: exe } } : {}) }

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['json', { outputFile: 'e2e-results.json' }]] : 'list',
  projects: [
    {
      name: 'preview',
      testMatch: /preview\.spec\.js/,
      use: { ...use, baseURL: 'http://localhost:5173' },
    },
    {
      name: 'live',
      testMatch: /live\.spec\.js/,
      use: { ...use, baseURL: process.env.SMOKE_URL || 'https://iffl-auth.web.app' },
    },
  ],
  webServer: process.env.PW_PROJECT === 'live' ? undefined : {
    command: 'npx vite --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
