# Agent #8 — Scouts and the builder

Agents that propose and build improvements to the app, without being asked.

## What happens each week

1. **Capture.** Every page is opened in sample-data mode at phone and desktop width. Screenshots and usability numbers are saved.
2. **History.** Past scout pull requests are read: merged ones are what you wanted, closed ones are what you didn't.
3. **Three scouts, side by side.** Each may propose one change, or none.
   - **Visuals** — looks at the screenshots for anything cramped, lopsided, inconsistent, or better said with a small chart.
   - **Usability** — starts from the numbers: errors, sideways scrolling, tiny tap targets, unnamed buttons, slow pages.
   - **Data** — digs through the league history for a stat or story the app doesn't show yet.
4. **Build.** A builder writes the change in a private copy of `main`.
5. **Check.** The job itself (not the builder) confirms the change stays inside the browser app, then runs the tests and the build. One repair round if they fail; still failing, it is dropped.
6. **Review.** A second, stronger model reads the change and approves or rejects it.
7. **Pull request.** Approved changes are pushed and opened as pull requests labelled `scout`.

You merge, edit or close each one. Nothing ships on its own.

## Limits

- One pull request per scout per week. A scout with one still open proposes nothing.
- Scouts may change only `web/src` and `web/e2e`. They cannot touch security rules, Cloud Functions, the Mac jobs, the deploy workflow, sign-in, Admin, the database layer, or dependencies.
- At most 12 files and 700 changed lines. No deleted files. No weakening an existing test.
- Screenshots come from sample data only.

These are enforced in `ops/scouts/policy.mjs`, which runs on the finished change before anything is pushed.

## Running it

| Command | What it does |
|---|---|
| `node ops/graph/scouts.mjs --plan` | Prints the steps. Runs nothing. |
| `bash ops/scouts.sh --only data --no-pr` | A trial: one scout builds, nothing is pushed. The checkout is kept under `out/scout-work/`. |
| `bash ops/scouts.sh` | The full weekly run. |

**Turn on the weekly schedule** (Wednesdays 10:00):

```bash
cp ~/claude-agents/iffl-web-app/ops/com.iffl.scouts.plist ~/Library/LaunchAgents/
```

```bash
launchctl load ~/Library/LaunchAgents/com.iffl.scouts.plist
```

**Pause it:**

```bash
launchctl unload ~/Library/LaunchAgents/com.iffl.scouts.plist
```

## Teaching the scouts

- **Merge** a scout pull request and that scout leans toward more like it.
- **Close** one without merging and it leans away. A sentence in the closing comment is for you; the scout only sees the title and that it was closed.
- To change what a scout looks for, edit its file in `ops/scouts/prompts/`.

## Files

- `ops/graph/scouts.mjs` — the graph.
- `ops/graph/runner.mjs` — the runner it shares with the Tuesday job.
- `ops/scouts/capture.mjs` — screenshots and measurements.
- `ops/scouts/policy.mjs` — what a scout may change.
- `ops/scouts/prompts/` — what each scout, the builder and the reviewer are told.
- `out/runs/scouts-<date>.json` — what happened in a run. `out/scouts.log` — the log.
