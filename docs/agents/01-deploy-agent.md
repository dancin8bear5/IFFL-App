# Agent 1: Deploy + Verify

**Todoist:** `[1/6] Deploy agent` · p1
**Runs:** GitHub Actions (`dancin8bear5/IFFL-App`)
**Why first:** On Sep 23 the deploy stalled because Cowork can't use the Mac's git and Firebase logins. Agent 6 also depends on this one.

## Goal

On a push to the deploy branch, the agent runs the tests, builds, deploys, smoke-tests the live site, checks the critical processes, and reports the build state. You never need to open Terminal to ship.

## Pipeline

```
push → unit tests (web + functions) → vite build → rules emulator tests
     → firebase deploy → smoke (Playwright vs live) → critical-process checks
     → report (Telegram) → [fail] rollback or alert
```

## Build steps

### 1. Service account + secrets
- Create an `iffl-deployer` service account in `iffl-auth` with these roles: Firebase Hosting Admin, Firebase Rules Admin, Cloud Functions Developer, Service Account User, Cloud Scheduler Admin.
- GitHub secrets: `FIREBASE_SA` (the JSON key), plus `VITE_*` (the values from `web/.env`).
- **Done when:** `firebase projects:list` succeeds in a throwaway workflow.

### 2. Workflow `.github/workflows/deploy.yml`
- Trigger: push to `main`, plus `workflow_dispatch`.
- Steps: `npm ci` (web, functions) → `npm test` in both → write `web/.env` from secrets → `npm run build` → `firebase deploy --only hosting,firestore:rules,functions --non-interactive`.
- Any red step means no deploy.
- **Done when:** a trivial commit deploys with no manual step.

### 3. Rules tests (pre-deploy)
- Add `@firebase/rules-unit-testing` against the emulator.
- For every collection: a member can read, a non-member is denied, and a client write is denied where only functions write (`espnLiveScores`, `espnStandings`).
- **Done when:** removing the `espnLiveScores` rule makes CI fail. That's the bug the Sep 23 fix closed.

### 4. Smoke suite (post-deploy)
- `web/e2e/smoke.spec.js` (Playwright, Chromium) against `https://iffl-auth.web.app`:
  - The page loads with 200 and no console errors.
  - The login screen renders.
  - `?preview=1` Dashboard renders every section `DASHBOARD_SECTIONS` declares for the current phase.
  - `#history` opens and the Standings tab shows rows.
- **Done when:** it passes live and fails on a deliberately broken build.

### 5. Critical-process checks
- A Node script using the admin SDK (read-only). For each poller health doc, `lastRunAt` must fall inside the expected window and `lastError` must be null:
  - `espnLiveScores/{season}`: only inside the game window.
  - `espnStandings/{season}`: within 2h.
  - `config/groupmePoller`: within 30m.
  - `config/espnGmailPoller`: within 45m.
- Emulator run: trade propose → accept → the `onTradeWrite` path completes.
- **Done when:** a stale poller turns the run red.

### 6. Report + rollback
- Telegram (IFFL Bots, "Deploys" topic): commit SHA, then test / smoke / critical-process results as ✅/❌.
- On a smoke failure: `firebase hosting:clone iffl-auth:<prev> iffl-auth:live`, or alert only (see open decisions).
- **Done when:** a failed run posts ❌ with the failing step named.

## Decisions (Sep 25, 2026)
- [x] Deploy branch: `main`, merged by PR (main is branch-protected).
- [x] On a smoke failure: auto-rollback of hosting. Rules and functions are not rolled back.
- [x] Reporting: failures only. Repo variable `REPORT_ALWAYS=true` turns on every-run reports.
- [x] Signed-in smoke: yes, as a read-only account in `config/league.smokeUIDs`, with secrets `SMOKE_EMAIL` / `SMOKE_PASSWORD`. It can read but can't write anything.
