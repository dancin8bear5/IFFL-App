# Agent 7: Reels (Watch + Request, Human-Approved)

**Todoist:** `[7/7] Reels agent` · p2
**Runs:** Web app (Reels tab, request form, Admin → Reels queue) + Cloud Functions (notify, health) + **Mac renderer** (outside this repo — see Contract)
**Depends on:** #1 (deploy/CI + rules suite), #3 (the approval pattern this copies). **Blocked on:** `iffl-auth` upgraded to **Blaze** (Storage needs it; the billing grace ends ~Oct 8 regardless).
**Estate brief:** `claude/PROJECT_IFFL_REELS__STUDIO.md` (Cowork project). Mac side: `~/claude-agents/media-hyperframes-tool/`.

## Goal

League mates **watch** short MP4 reels in a new **Reels** tab, and **request** new ones from three templates. **Nothing renders or publishes until Jared approves.** Rendering happens on Jared's Mac (HyperFrames: HTML → MP4); this repo never renders, never runs an LLM for reels, and never exposes the Mac.

## State machine (`reelRequests/{id}.status`)

```
pending ──approve──▶ approved ──(Mac claims)──▶ rendering ──▶ done   (reels/{id} written)
   │                     │                           │
   └──reject──▶ rejected └──unapprove──▶ pending     └──fail──▶ failed (error kept; Admin can re-approve)
```

Clients may only create `pending` and cancel their own `pending`. Only the commissioner moves `pending ⇄ approved` / `rejected`. Only the Mac (Admin SDK, bypasses rules) writes `rendering | done | failed` and `reels/*`. The rules and the tests enforce all three.

## Templates (v1)

| `template` | Fields (all required, trimmed, length-capped) | What renders |
|---|---|---|
| `hype` | `teamSlug` (must exist) | That team's card animated: rank, grades, their power-rankings line |
| `roast` | `targetSlug`, `line` (≤ 100 chars) | Target team's card + the requester's line, attributed |
| `trade` | `teamA`, `teamB`, `gets` (≤ 120), `gives` (≤ 120) | Trade-alert card, both logos/colors |

Fields are **data, never HTML** — the Mac builder escapes them. No free-text prompt exists anywhere in the member flow.

## Build steps

### 1. Data model + rules (+ Storage rules)
- `reels/{id}`: `{title, template, path, posterPath, durationSec, width, height, bytes, createdAt, requestId|null, requestedBy|null, hidden:false}` — **no client writes.** Read: `isReader()` and `hidden != true` (commissioner reads all).
- `reelRequests/{id}`: `{template, fields, uid, teamSlug (requester's), status, createdAt, decidedAt, decidedBy, error|null, reelId|null}`.
  - create: `isMember()` && `request.resource.data.uid == request.auth.uid` && `status == 'pending'` && template ∈ {hype, roast, trade} && field keys exactly the template's && every string within its cap && **no other `pending|approved|rendering` request by this uid** (enforce via a `reelQuota/{uid}` doc written in the same batch: `{open: requestId}`; create only if it doesn't exist or is empty).
  - update by owner: only `status: pending → cancelled`. Update by `isCommissioner()`: only `status` among `pending|approved|rejected` + `decidedAt/decidedBy`.
  - read: owner, or `isCommissioner()`.
- `storage.rules` (new file; add `"storage": {"rules": "storage.rules"}` to `firebase.json`): `reels/**` read if member (cross-service `firestore.get` of `config/league`, same membership test as `isReader()`); **write: false** for every client.
- Health doc `config/reelRenderer` `{lastPollAt, lastRenderAt, lastError}` — written by the Mac, read by #1.
- **Done when:** `tests/rules` proves: member can't write `reels`; member can't create a 2nd open request; member can't set `approved`; field over cap is rejected; non-member can't read a reel; smoke account reads but can't write. `rulesCoverage.test.js` passes (every new collection has a rule).

### 2. Reels tab (watch)
- New lazy view `ReelsView.jsx`, slug `reels` in `TabLayout`/`routing.js` (alias `videos`), deep link `#reels/<id>`.
- Vertical feed, newest first, `onSnapshot` on `reels where hidden == false order by createdAt desc limit 30`. Each card: `<video playsinline controls preload="metadata" poster=…>` from `getDownloadURL(path)`; title; template chip; "requested by <team>" when present; **Share** (copies `#reels/<id>` link).
- Behind an **Admin → Areas** switch `reels` (kill switch, like every league-visible area).
- Use the app's own theme tokens (BeltTheme). Empty state: "No reels yet."
- **Done when:** Jared's first published reel plays on iPhone Safari from the tab and the deep link opens it.

### 3. Request a reel (members)
- Button in the Reels tab → sheet with the three templates; each shows only its fields (team pickers from `config/league` teams, char counters on text).
- Writes the request + quota doc in one batch; shows "Waiting for approval" with Cancel while open.
- **Done when:** a member creates one request, can't create a second, can cancel it.

### 4. Admin → Reels (approval queue)
- New Admin section `Reels` (copy the Notes pattern): pending queue with the fields rendered as the member typed them, **Approve / Reject**; approved/rendering/failed lists with error text and **Re-approve**; published reels list with **Hide**.
- **Done when:** Jared can take a request to `approved` on his phone and hide a published reel.

### 5. Notify + health (Cloud Functions)
- `onDocumentCreated('reelRequests/{id}')` → Telegram to Jared (existing `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` secrets): `🎬 Reel request · <template> · from <team> → Admin → Reels`.
- `onDocumentWritten('reelRequests/{id}')` → when it becomes `done`, notify the requester in-app (Messages) and, if enabled, draft a league note via #3 (`type: 'reel'`, still human-approved).
- `pollerHealth.js`: flag `config/reelRenderer.lastPollAt` older than 30 min **while any request is `approved`** (the Mac may sleep otherwise — that's fine).
- **Done when:** a new request pings Telegram within a minute; a done request reaches the requester.

### 6. Ship
- PR into `main` (branch-protected) → CI deploys hosting + rules + **storage rules** + functions, smokes, reports to Telegram.
- **Done when:** CI green and the smoke account can load `#reels`.

## Contract with the Mac renderer (built in the estate, not here)

The Mac side lives in `~/claude-agents/media-hyperframes-tool/` and is built from Cowork. This repo only needs to honour this contract:

| Step | Mac does |
|---|---|
| Poll | every 2 min (launchd), query `reelRequests where status == 'approved'`; write `config/reelRenderer.lastPollAt` |
| Claim | transaction `approved → rendering` (guards double render) |
| Render | deterministic template builder → HyperFrames → MP4 (1080×1920, H.264, ≤ 60 s) + poster PNG |
| Publish | upload `reels/<id>.mp4` + `reels/<id>.jpg` to the default bucket; write `reels/<id>`; request → `done` with `reelId`; delete `reelQuota/<uid>` |
| Fail | request → `failed` with `error`; delete quota doc |
| Jared's own reels | Video Studio **Publish to app** writes `reels/<id>` with `requestId: null` |

Credential: a Firebase **service-account JSON** in the estate vault (`~/claude-agents/_shared/estate/files/iffl-web-app__firebase-admin.json`, House Rule 12). Never in this repo, never in GitHub.

## Open decisions
- [ ] Who approves — Jared only (current `isCommissioner()`), or also M. Zurek as commissioner?
- [ ] Should approved reels auto-post a league note, or only appear in the tab?
- [ ] Roast guardrail: is Jared's approve tap enough, or also a word blocklist in the rules/form?
