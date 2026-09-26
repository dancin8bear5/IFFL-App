# Trade Ingest — Rebuild Spec (2026-08-16)

## Why we're here
On 2026-08-16 a real trade happened and BOTH detection paths failed to flag it.
- ESPN approval email (7:41am CST) → never triggered a chat review.
- GroupMe 🚨 + trade text → parser missed it entirely.

This doc is the authoritative spec for the rebuild.

## The trade (ground truth)
**ESPN email (official, players only):**
- Moon (Jared) SENDS Dak Prescott → to Cats (Jason)
- Cats (Jason) SENDS KaVontae Turpin → to Moon (Jared)
- No pick in ESPN. ESPN cannot record future-pick trades.

**GroupMe chat (human intent, includes side-deal):**
- 12:42:04 — bare `🚨`
- 12:42:53 — "Jason gets Dak / Jared gets Jason's 2027 2nd + Turpin"
- NOTE: chat text has direction scrambled/shorthand AND adds a **2027 2nd**
  that ESPN never sees.

## KEY ARCHITECTURAL INSIGHT
The two sources are **complementary, not redundant**:
- ESPN email = authoritative on PLAYERS.
- GroupMe = authoritative on PICKS / side-deals / human context.
- The system must **reconcile** them and flag disagreements for human review,
  NOT auto-execute when they conflict.

## ESPN email format (parser spec)
Anchor: "The following trade has been accepted"
```
League:  Insanity League
To:      <full espnName>     e.g. "Shoot the Moon: IV"
From:    <full espnName>     e.g. "The Mojave Miracles"
<ABBREV> trades              e.g. "MOON trades"
  <Player>, <POS> (<NFL>)    e.g. "Dak Prescott, QB (DAL)"
<ABBREV> trades
  <Player>, <POS> (<NFL>)
```

### DIRECTION TRAP (critical)
- "MOON trades Dak" means MOON **SENDS** Dak (Dak leaves MOON).
- The `To:`/`From:` header lines are a DECOY — do NOT derive direction from them.
- Authoritative direction = the "<ABBREV> trades <player>" blocks.
- ALWAYS validate resolved direction against live roster (player must currently
  be on the sending team) before executing.

### Two team-name systems in one email
- `To:`/`From:` use full espnName → maps via existing espnName map.
- "<ABBREV> trades" headers use the `abbrev` slug (MOON, CATS, TACO, etc.)
  → NOT currently in the Cloud Functions map. Must add abbrev resolution.

## Master identity map (source of truth)
`web/src/data/staticData.js` → `fantasyTeams[]`. Each team has 4 identities:
`name` (internal) · `espnName` · `groupMeName` · `abbrev` (ESPN slug).

| name     | espnName                    | groupMeName      | abbrev |
|----------|-----------------------------|------------------|--------|
| A. Zurek | Cinderella Story            | Cinderella Story | TACO   |
| Abad     | Horner Park Johnson-Rods    | Johnson-Rods 3.0 | JRDP   |
| Bill     | bill pony club              | B2B Champ        | BILL   |
| Cantone  | Aussie Rookie Ramblers      | CEO OF WATER     | ARR    |
| Dugan    | Cream Of Wheaton            | Mike Dugan       | DPGE   |
| Faybik   | Allegiant Pots N Pans       | Michael Faybik   | PNP    |
| Foley    | Wheaton Creampeyes          | Brett Foley      | BF     |
| Jared    | Shoot the Moon: IV          | Jared            | MOON   |
| Jason    | The Mojave Miracles         | Shadeson         | CATS   |
| M. Zurek | Meta Knights                | Matt Zurek       | ZHop   |
| Ryan     | The Replacements            | Ryan Schwerman   | Ryan   |
| Wayne    | River Forest Republicans    | Wayne VH         | GOP    |

## Draft picks = first-class assets (CONFIRMED)
- `draftPicks` collection exists.
- `applyTransfer` in index.js already handles picks:
  assetType!=="player" → updates `draftPicks.currentTeamName`.
- Transfer plumbing is DONE. Gaps are only in DETECTION + RECONCILIATION.

### Pick value guidance (Jared)
- 1st-round picks are premium, ESPECIALLY 2027 and ESPECIALLY projected Top 4–6.
- 2nd-round picks are solid assets.
- Picks ONLY ever appear in GroupMe, never in the ESPN email.

## GroupMe parser — root defects to fix
1. Per-message classification with no look-ahead: bare 🚨 and the trade text
   are separate messages, never linked.
2. Keyword-brittle: "Jason gets Dak / Jared gets Jason's 2027 2nd + Turpin"
   matched NO keyword and no emoji → slipped past entirely.

### GroupMe parser — required behavior
- Detect trade SYNTAX, not just keywords:
  - "X gets Y", "for", "+", player names (roster match), pick tokens.
  - Pick tokens: "2027 2nd", "2027 R1", "1st", "2nd", "third", etc.
- Link a bare 🚨 to same-sender follow-up messages within a short window
  (~2–3 min) → stitch siren + deal into ONE review item.
- Extract STRUCTURED content into the signal doc (players, picks, sides),
  not just "a keyword tripped."

## ESPN Gmail scrape — open items
- Make.com scenario is an external black box. Confirmed today: `ingestEspnTrade`
  had ZERO real invocations, so the email never reached the function.
- Need to verify Make.com is scraping the right label/query (`espn-trade` label).
- Add a Firestore ingest-state / heartbeat doc so a silent Make.com failure is
  VISIBLE instead of looking like "no trade happened."
- Email body confirmed reachable in jaredrogtaylor@gmail.com under `espn-trade`
  label. No standing programmatic Gmail read access yet (would need OAuth client
  w/ gmail.readonly + stored refresh token; personal gmail can't do SA delegation).

## Reconciliation flow (target design)
1. ESPN email → structured player trade (authoritative players).
2. GroupMe 🚨 + trade syntax → structured intent (authoritative picks/side-deals).
3. Reconcile:
   - Players match both sides → OK to consider auto-apply.
   - GroupMe adds picks not in ESPN → REQUIRE human review (today's case).
   - Direction mismatch / ambiguity → REQUIRE human review.
4. Never auto-execute on conflict.
