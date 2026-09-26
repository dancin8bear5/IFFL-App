# Agent 6: Design + Usability Review

**Todoist:** `[6/6] Design + usability review agent` · p3
**Runs:** GitHub Actions (after #1's deploy succeeds, plus a weekly cron) and the Claude API
**Output:** IFFL-labeled Todoist tickets. **It never edits code.**
**Depends on:** #1 (it hooks the deploy success step).

## Goal

The agent audits the live app for design and usability problems, and files only **new** issues as tickets with screenshots.

## Why not "constantly"

Running it continuously would find the same issues on every pass and burn tokens. So it runs after each deploy (catching regressions) and does a full weekly sweep.

## Build steps

### 1. Rubric (`docs/agents/design-rubric.md`)
- **Hard fails:** WCAG AA contrast, tap targets under 44px, horizontal scroll at 390px, rail content overflowing 270/300px, missing loading or empty states, console errors.
- **Judgment:** hierarchy, copy clarity, consistency across tabs, and the IFFL visual language (domain-specific, not generic app UI).
- **Done when:** Jared signs off on the rubric. It's the agent's grading sheet.

### 2. Crawler (Playwright)
- Matrix: every tab × {390px, 1280px} × each season phase via `?preview=1&phase=<p>`.
- Output: a full-page PNG per cell, plus `axe-core` JSON.
- **Done when:** one run produces the full matrix, about 60 shots.

### 3. Review pass
- Hard fails come from axe and DOM checks, deterministically, with no LLM involved.
- For the judgment items, Claude API (vision) grades each screenshot against the rubric and returns `{screen, severity, issue, evidence}`.
- **Done when:** a planted regression (for example, shrinking a button) gets flagged.

### 4. Dedup + ticketing
- Fingerprint = `hash(screen + viewport + rubric_item)`, stored in `config/designReview.seen`.
- It files only new fingerprints to Todoist Fantasy (`IFFL`, `design` labels), with the screenshot attached.
- A resolved issue that comes back gets reopened, not duplicated.
- **Done when:** a second run with no changes files zero tickets.

### 5. Triggers
- `workflow_run` after #1 succeeds, in regression mode: it only diffs screens touched by the commit.
- Cron Sunday 08:00 CT: a full sweep.
- **Done when:** both triggers fire for a week.

## Open decisions
- [ ] Does the iOS app get audited too, or web only? (Web is the distribution plan.)
- [ ] Should severity map to Todoist priority (critical → p1)?
- [ ] Monthly Claude API spend cap for vision grading.
