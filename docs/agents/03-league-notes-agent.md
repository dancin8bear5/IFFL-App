# Agent 3: League Notes (Human-Approved)

**Todoist:** `[3/6] League notes agent` · p2
**Runs:** Cloud Functions (drafting + sending), with the Admin UI for approval
**Depends on:** #2 for the recap data.

## Goal

The agent drafts league notes automatically. **Nothing is sent until Jared approves both the content and the send time.** That is the hard requirement.

## State machine

```
draft ──approve(body, sendAt)──▶ approved ──sendAt ≤ now──▶ sent
  │                                 │
  └──reject──▶ rejected             └──unapprove──▶ draft
```

There is no path from `draft` to `sent` except through `approved`. The rules and the sender both enforce this.

## Note types (v1 = recap only)

| Type | Trigger | Default send time |
|---|---|---|
| `recap` | #2 finishes week N | Tue 12:00 CT |
| `trade` | `trades/{id}` status → executed | +1h |
| `deadline` | calendar milestone 72h / 24h out | 9:00 CT |
| `record` | #2 writes a `leagueRecords` change | with the recap |
| `phase` | season phase changes | 9:00 CT |

## Build steps

### 1. Data model + rules
- `leagueNotes/{id}`: `{type, status, body, draftBody, proposedSendAt, sendAt, destination, sourceRef, createdAt, approvedAt, sentAt}`.
- Rules: commissioner-only read and write while `status != 'sent'`; members read once it's `sent`. Clients can't write `status: 'sent'`.
- **Done when:** the rules tests (in #1's suite) prove a member can't read a draft and no client can mark one sent.

### 2. Drafter
- A function per trigger that assembles the facts (scores, trades, records) as structured input.
- Claude API writes `draftBody` in the league voice (reuse the Power Rankings voice prompts).
- A facts check: every number in the body must appear in the input, or the draft gets flagged.
- On a new draft, DM Jared on GroupMe: `New recap draft → Admin → Notes`.
- **Done when:** a week-3 recap draft lands with correct numbers.

### 3. Admin → Notes
- A queue of drafts. For each: edit the body, set or change the send time, pick the destination, then Approve, Reject or Unapprove.
- A preview of how it will look in GroupMe.
- **Done when:** Jared can take a draft to approved on his phone.

### 4. Sender
- `onSchedule("every 5 minutes")`: query `status == 'approved' && sendAt <= now`.
- A transaction flips it to `sending`, it posts, then marks it `sent`, which guards against a double send.
- Destinations: the GroupMe group (bot), and the app Messages.
- **Done when:** an approved note posts once, and an unapproved one never does.

### 5. Add the other types
- Add `trade`, `deadline`, `record` and `phase` one at a time, each behind its own toggle.

## Open decisions
- [ ] Destination for v1: GroupMe group, app Messages, or both?
- [ ] Should unapproved drafts expire after N days?
- [ ] Can a co-commissioner (B2B / Zurezo) approve, or only Jared?
