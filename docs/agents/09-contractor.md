# 9 — The contractor

You say what you want changed on the site. A contractor hires a crew of Claude
agents to build it and hands you a pull request. It is the builder lab's
contractor (`~/claude-agents/agent-builder-lab`) pointed at the real app.

## Run it

```bash
cd ~/claude-agents/iffl-web-app && node ops/graph/contractor.mjs build "what you want changed"
```

| command | what it does |
|---|---|
| `build "…"` | the whole job, ending in a pull request |
| `plan "…"` | hires only the architect — shows who *would* be hired; changes nothing |
| `build` | picks up a planned or stopped build where it left off |
| `build --no-pr "…"` | builds and inspects, opens nothing |
| `status` | who was hired and how each did |
| `reset` | shelves the current build in `out/contractor/archive/` (nothing is deleted) |

Watch it work: open `out/contractor/build/tree.html` — who made whom, refreshing
itself. Each hire's exact brief is in `out/contractor/build/crew/<id>/brief.md`.

A build uses a few dollars' worth of the Claude plan allowance (a list-price
estimate, not a charge) and takes 15–40 minutes.

## Who does what

| who | what it is | what it does |
|---|---|---|
| contractor | `ops/graph/contractor.mjs`, the only hand-written part | hire · check · commit · record · stop |
| architect | Claude, read-only | reads the app and your request; writes the blueprint: the trades and each one's brief. May answer "this cannot be built" |
| trades | Claude, one at a time | each works in ONE area and sees the work before it |
| helpers | Claude | the architect may mark one big trade a **lead**; the lead writes briefs for 1–2 helpers of its own, then joins their work. A helper hires no one |
| inspector | Claude, a different and stronger model | reads the finished change, names what is wrong; those trades get one fix |

## Answer mode — ask a question, get a private report (Nov 27, 2026)

```bash
node ops/graph/contractor.mjs ask "who is the best keeper value from 2026"
```

No site change, no pull request. A second crew works the question out and
opens `out/contractor/answers/<id>/report.html` on this Mac (git ignores
`out/`).

| Hire | Does | Checked by code |
|---|---|---|
| Analyst | Decides HOW to answer, from `ops/contractor/definitions.md` and the real data. An undefined term stops the run and puts the question to the commissioner in the report. | Has a title, a method and steps — or a reason. |
| Calculator | Writes `calc.mjs`, one file. | Only that file; reads files and nothing else; the CONTRACTOR runs it sealed and the output has no holes. |
| Checker | A different, stronger model reads the calculation and its output. One fix round. | Names a problem if it fails. Doubts that survive lead the report. |
| Writer | A headline and a few paragraphs. | Every digit must be in the calculation's output (rounding allowed). Two misses and the report ships with numbers only. |

**Code computes every number.** The calculator's own claims are ignored; the
numbers are what `calc.mjs` printed when run under `sandbox-exec` with no
network, no writes and no reads outside its folder.

**The one read of the live database.** `players` — today's rosters and
prices — is fetched by the contractor's own code with the Mac's gcloud
login, trimmed to an allowlist of fields, and handed to the crew as
`players.json`. The crew holds no login. Nothing is ever written. If the
gcloud login is gone the run continues from the league files and says so.
`data/big-board-*` is never copied to a crew.

**Definitions are the commissioner's.** `ops/contractor/definitions.md`
holds his rulings (keeper price, keeper value, trade analysis, scores
against a team). Add a ruling there; do not let a crew guess.

**Put an answer on the site:** `node ops/graph/contractor.mjs build --answer <id>`
starts an ordinary build whose crew finds the checked calculation and its
method on the desk (`.contractor/calc.mjs`, `.contractor/method.md`). It
ends in a pull request like any other build.

An answer does not resume: four hires, so a stopped one is asked again.

## The rules it cannot break

Enforced by `ops/contractor/checks.mjs`, not by the briefs.

- **Areas.** A trade may change files only in its area: `web` (`web/src`,
  `web/e2e`, `web/public`), `functions`, `scripts` (`web/scripts`), `rules`
  (`firestore.rules`, indexes, `tests/rules`), `docs`.
- **Off limits to everyone:** `.github/`, `ops/`, `data/`, `.env`,
  `package.json`, `firebase.json`, keys, plists, unreleased rankings text.
  No deleted files. No test may lose more lines than it gains.
- **Checked.** After each trade: its files against its area, then that area's
  tests. At the end: the whole change, `npm test`, `npm run build`, and the
  functions tests if functions changed.
- **One retry.** A rejected hire gets one more try with the reason. A second
  failure stops the build; `build` again resumes there.
- **Capped.** 6 trades and helpers, 8 hires in all, 30 files, 2,000 lines.
- **Private checkout.** The crew works in `out/contractor-work/`, cut from
  `origin/main` — never the checkout the Mac's scheduled jobs run from.
- **It ends at a pull request.** Never merges, never deploys, never runs a
  script against live data. If the inspector still lists problems after the
  fix round, the pull request opens as a **draft** with them at the top.
- **Warned.** A change to security rules, server functions, sign-in, Admin or
  the database layer is allowed — and named under "Look at this before
  merging".
- **Hand-run.** No schedule, no secrets, nothing registered.

## How it differs from the lab and from the scouts

- **The lab** seals each hire in its own folder (`sandbox-exec`) and glues
  one-file parts into a page. A real app can't be built from one-file parts,
  so here the seal is the private checkout plus the code checks, and the glue
  is git: one commit per trade.
- **The scouts** decide for themselves what to build, once a week, in the
  browser app only. The contractor builds what you ask, when you ask, and
  may reach rules and functions. Both end in a pull request you merge.

## What it cannot do

- "Update data" means code and bundled data in the repo. It cannot read or
  write live Firestore, ESPN or GroupMe — it has no secrets. A change that
  needs live data arrives as a script plus a line under "Only you can do".
- It cannot see the signed-in app. The inspector reads code; it does not
  click through screens.
- It cannot add a dependency.

## Tests

`ops/graph/contractor.test.mjs` — a fake crew and a fake checkout, no Claude,
no git. Runs in CI with the other `ops/graph` tests.
