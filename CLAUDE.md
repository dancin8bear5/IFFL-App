# The Belt App — Working Notes

> **App name is "The Belt"** (Fantasy Football League). The old "IFFL" / "CodeRed" branding has been scrubbed from user-facing surfaces and code symbols. The internal Xcode target/workspace is still named `CodeRed` (invisible to users — deliberately not renamed to avoid breaking CocoaPods). The Firebase project id is still `iffl-auth` (project ids can't be renamed; backend migration deferred).

> **Always open `CodeRed.xcworkspace`** — not `CodeRed.xcodeproj`, not any other workspace file. The workspace is what links CocoaPods (Firebase, Google Sign-In). Opening the bare project gives "Firebase module not found".

> **WEB APP IS THE PRIMARY DISTRIBUTION PATH** (Aug 2026): repeated App Store
> rejections led to a full web port in `web/` (Vite + React + Firebase JS SDK,
> same `iffl-auth` backend). Deploys to Firebase Hosting → league members open
> one URL, Add to Home Screen. See `web/DEPLOY.md`. The iOS app still builds
> but is no longer the distribution plan.

## Pinned Commands

```bash
# Pull latest + pod install + open Xcode (run this before every archive)
cd ~/claude-agents/apps/iffl-web-app && pod install && open CodeRed.xcworkspace

# Deploy Cloud Functions
cd ~/claude-agents/apps/iffl-web-app && firebase deploy --only functions

# Deploy WEB APP + security rules (hosting serves web/dist — see web/DEPLOY.md)
cd ~/claude-agents/apps/iffl-web-app/web && npm run build && cd .. && firebase deploy --only hosting,firestore:rules

# Web app local dev (http://localhost:5173 — add ?preview=1 for sample data, no sign-in)
cd ~/claude-agents/apps/iffl-web-app/web && npm run dev

# Pull from active branch
cd ~/claude-agents/apps/iffl-web-app && git pull --no-rebase origin claude/insanity-league-ios-app-g73Jo
```

## Web app (`web/`) at a glance
- Vite + React 18 + Firebase JS SDK v10. Same Firebase project/collections as iOS — zero data migration.
- Structure mirrors iOS: `src/context/AppContext.jsx` = AppState; `src/services/firestoreService.js` = FirestoreDataService; `src/services/marketEngine.js` = MarketEngine (unit-tested, `npm test`).
- Auth: Google popup/redirect + email/password. Apple Sign-In intentionally omitted (was an App Store requirement only).
- `firestore.rules` (repo root): reads require league membership (uid in `config/league.userTeamMap` or `authorizedUIDs`); roster/config writes commissioner-only. Deployed with hosting.
- `web/.env` holds Firebase web config (from Console → Project settings → Your apps → Web). Never committed; template in `web/.env.example`.
- PWA: manifest + icons → Add to Home Screen gives near-native feel. `public/privacy.html` still served at `/privacy.html`.

## Backups (Aug 26, 2026)
Weekly Firestore snapshot → **the NAS** (`/Volumes/homes/jaredrogtaylor/Backups/IFFL`,
SMB on 192.168.1.124), Sundays 09:00 via `ops/com.iffl.weekly-backup.plist`.
Never to the Mac or iCloud, and **never to git — this repo is PUBLIC** and
`config/league` holds every member's email and Firebase UID. Details and the
restore procedure: `data/README.md`. Firestore delete protection is ON;
point-in-time recovery is OFF (paid, declined), so the weekly snapshot is the
only undo for a bad write.

## Historical data — full ESPN export imported (Aug 26, 2026)
The complete ESPN league history 2008–2025 (every team, player, week, and
draft) lives in Firestore, imported from `iffl_fantasy_history_2008-2025.csv`
by `web/scripts/import-history.mjs` (re-runnable; fixed doc ids, so re-import
replaces rather than duplicates). Auth: the script uses
`gcloud auth print-access-token` + Firestore REST — **there is no
serviceAccountKey.json on this Mac**; the gcloud CLI login (jaredrogtaylor@)
is the admin path.

Collections (doc id = season year unless noted; member-read/commissioner-write
rules deployed):
- `historyTeamSeasons/{year}` — per-team W-L-T, PF/PA, finalRank, playoffSeed,
  espnTeamId + espnName + master `team` name (the per-season identity map).
- `historyMatchups/{year}` — every game, one row per team per week (incl.
  playoffs), with margin, result, benchPoints.
- `historyPlayerSeasons/{year}` — every rostered player's season totals.
- `historyPlayerWeeks/{year}-{WW}` — weekly player lines (**2018+ only**;
  ESPN kept no weekly player data before 2018).
- `historyDrafts/{year}` — full draft results (auction prices, keeper flags)
  + keeperRoundPicks (2020+).
- `weeklyScores/{year}` — backfilled in the app's native
  `{weeks: {"1": [{teamName, points}]}, records}` format for all 18 seasons,
  so historical seasons power the same charts/True-Record math as the current
  one. The import skips any season that already has entered weeks.
- `leagueRecords/auto-*` — 9 computed Trophy Room record cards (highest/lowest
  game, biggest blowout, closest margin, best player game, etc.).
- `leagueHistory/{year}` — standings **rebuilt from ESPN data**: real
  pointsFor/pointsAgainst/playoffSeed added, record strings corrected (the
  hand-seeded records had many errors — e.g. Jared 2019 is 8-5, not 11-3),
  and 2008 filled in (10 teams; champion M. Zurek, runner-up Bill).
  champion/runnerUp/notableTrades preserved from the seeds.

### Big Board — REMOVED from the app (Aug 31, 2026)
The view, `bigBoardFilter.js`, the Firestore helpers, the `#board` tab and
its nav toggle are all gone. **The `bigBoard` Firestore collection was NOT
deleted** and its commissioner-only rule is still in place, so restoring
the feature means restoring UI against the same documents — removing code
is not removing data.

**Backups live on the NAS, never in git.** `data/big-board-*.csv` is
gitignored: the board is the commissioner's keep/drop calls on other
people's rosters, its Firestore rule is commissioner-only for READ, and
this repo is public. A copy was briefly committed on Aug 31, 2026 and
removed the same day — it remains in git history, so treat those calls as
public and don't add another.

Two offline copies exist and they are NOT equivalent:
- The snapshot taken the day it was retired — 299 players plus the per-owner
  cap table. Has **NFL Team**, has **no tier**.
- `web/scripts/export-big-board.mjs` — dumps the live collection (298 rows,
  which has **tier** but no NFL team) via `gcloud auth print-access-token`.
  Run it for an authoritative copy before ever deleting the collection, and
  put the CSV on the NAS.

Old `#board` and `#bigboard` links land on the Dashboard; the routing alias
was retired with the tab.

### League History page (`#history`) — six tabs, exportable (Aug 31, 2026)
Replaced the two Dashboard pop-ups ("Last Season" and "League History"),
which were the same question at two zoom levels and could not be linked to,
sorted or exported. One tile now opens the page; Trophy Room stays separate.

**Declaration-driven.** Each tab is one object in
`web/src/services/historyCategories.js` — its columns and how to flatten its
source. `web/src/services/historyTable.js` (24 tests) derives everything
else: what the search reads, which filter controls appear, the sort, and the
CSV. Six tabs are not six screens, and a seventh is one object and no new
UI. Tabs are alphabetical: Auction · Games · Player Scores · Rookie Drafts ·
Standings · Trades. Deep-linked as `#history/player-scores`.

**Loading is staged by each category's declared `cost`:**
- `bundled` — Auction (4,066 rows) and Games (3,480) generated into
  `web/src/data/{auctionHistory,gamesHistory}.js` by
  `generate-history-data.mjs`; rookie drafts, trades and standings likewise.
  2008–2025 never changes and gzips to 82KB in a lazy chunk, so fetching it
  bought a round trip and a dependency on the import having been run.
- `season` — Player Scores only. The weekly lines are 32,000 rows, so the
  season selector decides what is FETCHED, not what is filtered afterwards.
  **Needs the `historyPlayerWeeks` composite index** (season + week) in
  `firestore.indexes.json`, or that view returns empty with no error.

Standings carries an all-time toggle reusing `leagueStats.computeAllTimeStats`.
The tab is switchable from Admin → Areas under key **`historyQuery`** (NOT
`history` — that key already switches the Trophy Room tiles).

### Trade history 2022–2024 (Aug 31, 2026)
101 trades / 409 asset movements, from the league's hand-kept workbook
(`data/Trades_2022-2024.xlsx`). **2025 was never kept — 2022-24 plus 2026 is
all the trade history that exists.** Pipeline:
`convert-trade-sheet.py` → `data/trades-2022-2024.csv` (the committed source
of truth, one row per asset that moved) → `generate-trades-history.mjs
--write` → `web/src/data/tradesHistory.js`, which is bundled with the app in
the same shape as `trades2026.js` so `seedHistoricalTrades()` can push it to
Firestore without a second translation.

The workbook carries TWO layouts (it was rebuilt between seasons): 2022–23
use a dated row plus undated rows beneath it, blank row as terminator; 2024
drops the position column and the blanks, and marks a new trade only by a
date reappearing in column A. Draft picks appear in three notations
("2023 1.05 (Ryan)", "2023 2nd (Bill's)", "Foley 2024 1.02") and all 102
parse.

**Commissioner ruling on names: `Zurek` = M. Zurek, `Andrew` = A. Zurek**
(also `Corey` = Abad, `Matt` = M. Zurek). This is the opposite of
`functions/groupmeParser.js`, which leaves an ambiguous Zurek unresolved on
purpose — that scans unconfirmed live chat, this reads a finished record.

Worth chasing later: the 2022 rows name specific rookie slots ("2022 1.01"),
which the price-ladder recovery can't reach for 2022+ because the rookie
scale went flat that year.

### Rookie draft history — recovered by fingerprint (Aug 30, 2026)
**The rookie draft began in 2017.** Corey Davis at 1.01 was the first rookie
pick in league history, so `rookieDraftHistory` (2017–2025) plus
`rookieDraft2026` is the COMPLETE record — there is nothing earlier to find,
and ladder-priced players in 2013–2016 are auction buys, not picks.

ESPN never recorded the rookie draft as its own event: there is one draft per
season in the export (228 rows = 19 rounds x 12) and the rookie picks hide
inside it, because a rookie taken in July is simply on the roster when the
August auction happens. `web/scripts/extract-rookie-history.mjs` recovers each
class from a three-part fingerprint. Re-run it (`--write`) after any ruling:

1. **A real NFL rookie that season**, checked against `data/nfl-rookie-seasons.csv`
   (nflverse's player table trimmed to espn_id → rookie_season, committed so the
   extraction stays re-runnable; 93.5% of draft rows join, the misses are D/ST
   and kickers). NOT "first time we've seen him" — that's wrong for anyone who
   spent a year in the NFL before the league rostered him.
2. **The price is the slot.** Rookie contracts were a sliding scale through
   2021 — **$12=1.01, $10=1.02, $8=1.03, $6=1.04, $4=1.05**, with $2 covering
   1.06–1.12 and $1 the whole second round. **From 2022 the scale went flat:
   $2 = any first-rounder, $1 = any second-rounder.** So slots are exact only
   for the top five of 2017–2021; everything else carries a round and a null
   slot, which is the honest answer rather than a guessed one.
3. **Kept, not bought.** $1 and $2 are also ordinary auction prices. From 2020
   ESPN flags the picks as keepers and that settles it. Before 2020 it flags
   the returning keepers but NOT the rookies, so position stands in: ESPN
   writes the keeper block first, the league entered its rookie class
   immediately after it, and the auction follows — so the picks sit in one
   run before the first live bid. Walking that run is what separates a
   second-rounder from a dollar flyer (Mahomes, $1, overall 188 of 228 in
   2017) and it settled two ties the prices couldn't: **Joe Mixon (2017,
   overall 134) and Tony Pollard (2019, overall 172) were auction buys**, so
   Haskins holds 2019's 1.05.

Commissioner rulings live in the script's `RULINGS` table — 2018 1.05 is
Ronald Jones (not John Kelly Jr.), 2020 1.05 is D'Andre Swift (not Darrynton
Evans), and 2018 1.03 was made but the owner dropped the player before the
auction, so the slot is recorded with no name.

**Still open** (see the review artifact / `--json` dump): 2017 came back 18 of
24 with no 1.05 at all — was year one a full two rounds? 2022 has thirteen at
$1 for twelve second-round slots; 2023 has thirteen at $2 for twelve firsts.
2018/2020/2021 land 1–2 short, which is just what a dropped rookie looks like.

### Trophy Room analytics built on it (Aug 26, 2026)
Eight new sections, all fed by the collections above. Services are unit-tested
(`npm test`); components live beside the existing `TrophyAnalytics`:
- `services/historyAnalytics.js` + `TrophyHistoryCharts.jsx` — **Rivalry
  Dominance** (12×12 head-to-head grid), **Schedule Luck** (real wins minus
  all-play expected wins), **Clutch Factor** (postseason PPG − regular PPG).
- `services/draftAnalytics.js` + `TrophyDraftCharts.jsx` — **Scoring Eras**
  (per-team PPG vs that season's league average, sparklines), **Where the
  Money Goes** (auction spend share by position), **Draft Return** (career
  points per auction dollar).
- `services/lineupOptimizer.js` + `TrophyLineupCharts.jsx` — **Bench Regret**
  and **Roster DNA** (2018+ only).
- `leagueRecords` now holds **23 computed cards** (16 game, 7 player), written
  by the import script with fixed `auto-*` ids so re-running replaces them.

Three things worth knowing before touching this code:
1. **`historyAggregates/{scoring,draft,lineups}` are precomputed on purpose.**
   Those three charts each need a join across all 36 draft/player-season docs
   (~1MB). The import script does the join once; the browser reads 3 small docs.
   Re-run the import after any change to that math.
2. **The optimal-lineup solver is greedy and that is exact here.** Slot
   eligibility forms a laminar family ({RB} ⊂ {RB,WR} ⊂ {RB,WR,TE} ⊂
   {QB,RB,WR,TE}), so most-restrictive-slot-first is optimal. The test suite
   proves it against brute force on 300 randomized rosters — keep that test.
   IR players are never candidates; required slots are read from what was
   actually started that week, since the lineup shape changed across eras.
3. **ESPN's `Winner` column disagrees with its own scores on 7 playoff rows**
   (bracket bookkeeping). Margin records derive W/L from the scores; streaks
   and the rivalry grid use ESPN's official verdict, which is what the
   standings were built from. Similarly, starter points sum ≠ `TeamScore` on
   211 team-weeks, so bench regret is measured entirely within the player
   lines, and only the "would this loss have flipped" check uses the official
   score.

Every record card names the best CURRENT member and notes the all-time mark in
its detail line when a departed one did better — the Trophy Room hides cards
whose holder has left, so a former member's record would otherwise erase the
whole card rather than read as history.

Team identity across eras: ESPN team ids are stable franchise slots. The
import joined ESPN FinalRank against the seeded `leagueHistory` standings
per season to name each slot's owner per year (former members: Eric, Jim,
Lukas, Kerry, Chad, Vaswani, Vince, Yuancie, Nick, James, DeMott…). 2008
owners were borrowed from each slot's 2009 owner (validated: slot 5 =
M. Zurek = known 2008 champion). The full mapping prints when the script runs.

## Project at a glance
- SwiftUI iOS app (iOS 17.0+), Firebase backend (Auth/Firestore/Messaging), Google Sign-In.
- Xcode project: `CodeRed.xcodeproj` — but **always open `CodeRed.xcworkspace`**.
- Bundle ID: `com.thebelt.app` (was `com.IFFLtest.CodeRed`; changed in The Belt rebrand → a NEW App Store Connect record). Dev team: `LNHDZQ76WT`.
- Firebase project: **IFFL Auth** (id `iffl-auth`, sender `876749980452`). The archived `codered-2b3b4` project is dead — never reference it.
- **Deploy box — one clone, verified Aug 26, 2026:** `~/claude-agents/apps/iffl-web-app`.
  Two earlier paths in these notes were wrong and each cost a session:
  `~/Documents/Claude/Projects/IFFL-App` and
  `~/Documents/Claude/Projects/IFFL/"iOS App"`. Neither exists. There is
  also `~/Desktop/IFFL-backup-2026-08-16`, a dated snapshot — never deploy
  from it.
  The machine's hostname changed from `taylor-mac-pro` to `taylor-pro-2`
  at some point; both names are the same MacBook Pro, not two machines.
- **`web/.env` is gitignored and always will be.** It holds the Firebase
  web config. A fresh clone therefore builds *successfully* and produces an
  app that cannot reach Firebase — a silent failure that reads like a
  broken deploy. Copy the file across by hand; template at
  `web/.env.example`, values from Console → Project settings → Your apps → Web.
- **`archive/taylor-pro-2-local`** holds work that once existed on that
  laptop only: the parallel Supabase backend (`backend/` — migrations,
  seed scripts, `2026_IFFL_Master.xlsx`) and a second native app
  (`ios/IFFL/`, separate from the CodeRed target). Both are gitignored on
  the working branch; `ios/build` alone is 600MB.
- Branch protection on `main` — pushes are rejected, PRs required.
- Active development branch: `claude/insanity-league-ios-app-g73Jo`.

## Architecture
- Environment-driven SwiftUI: single `AppState: ObservableObject` injected via `.environmentObject`. No full MVVM.
- `AuthenticationService` separate `ObservableObject` for auth only.
- `MarketEngine` pure struct with static methods (zero Firebase deps, used for mutual-interest matching).
- One `NavigationStack` per tab — never nest NavigationStacks inside sheets.
- `@main` lives in `App/BeltApp.swift`. `App/CodeRedApp.swift` holds AppState, AuthenticationService, AppDelegate, LoginView, and shared subviews — no `@main`.

## Folder structure (current — Views/ is still flat)
```
App/             BeltApp.swift, BeltTheme.swift, CodeRedApp.swift
Models/          DataModels.swift
Services/        FirestoreDataService.swift, DataSeeder.swift, MarketEngine.swift
Views/           AdminView.swift, DashboardView.swift, RostersView.swift, MarketView.swift,
                 LeagueView.swift, WebViewContainer.swift,
                 FMKSwiperView.swift, LeagueHistoryView.swift, SettingsView.swift  ← added V2
Info.plist       CFBundleURLTypes (Google Sign-In) + FirebaseAppDelegateProxyEnabled=false
GoogleService-Info.plist   NOT in git — local only on Mac
serviceAccountKey.json     NOT in git — server credentials, must never ship in iOS bundle
```

## Design system (`BeltTheme.swift`)
Color tokens (hex → use): `beltBg #0A0D1A` (screens), `beltSurface #141827` (cards), `beltElevated #1E2235` (modals), `beltAccent #E63946` (CTAs/active), `beltGold #F4A261` (prices), `beltText #FFFFFF`, `beltSubtext #9EA8B8`. xcassets colorsets are aligned to the same hex values so AdminView's `Color("BackgroundColor")` calls produce identical output to `Color.beltBg`.

## Hard-won lessons (read before touching these areas)

### Xcode `INFOPLIST_KEY_*` is scalar-only
Do **not** embed XML as a string in `INFOPLIST_KEY_CFBundleURLTypes` (or any nested-structure key). Xcode serializes it as a plain string, not a real array — Google Sign-In's runtime check finds no schemes and throws `NSInvalidArgumentException`.
**Fix pattern:** real `Info.plist` at repo root with the nested key, plus `INFOPLIST_FILE = Info.plist` in both Debug and Release. Keep `GENERATE_INFOPLIST_FILE = YES` so Xcode still merges in the scalar `INFOPLIST_KEY_*` values (orientations, scene manifest, etc.).

### `REVERSED_CLIENT_ID` is a build variable
`Info.plist` references `$(REVERSED_CLIENT_ID)`. The actual value lives as a user-defined build setting in `project.pbxproj` for both Debug and Release: `com.googleusercontent.apps.876749980452-l07n7gh17nq6apnf8u7uc6ceia8dlg3r` (updated for the `com.thebelt.app` iOS app added to `iffl-auth`). If this drifts from `GoogleService-Info.plist`'s `REVERSED_CLIENT_ID`, Firebase Auth returns `CONFIGURATION_NOT_FOUND` (code 17999).

### CocoaPods workflow on Mac
- After cloning or pulling: run `pod install`, then open `CodeRed.xcworkspace`.
- gRPC-Core fails simulator builds with `Command CodeSign failed`. Fix in `Podfile` post_install: `config.build_settings['CODE_SIGNING_ALLOWED'] = 'NO'`.
- `pod install` needs significant disk space (Firebase headers). If `Errno::ENOSPC`, clear `~/Library/Developer/Xcode/DerivedData/*` and `xcrun simctl delete unavailable` before retry.
- User's Mac has local Podfile customizations — `git pull` often conflicts. Standard recovery: `git stash && git pull origin <branch> --no-rebase && git stash pop` (or `git stash drop` if remote already has the fixes).

### Secrets must stay out of git
`.gitignore` covers `GoogleService-Info.plist`, `serviceAccountKey.json`, `*.pem`, `*.p8`, `*.p12`, `Pods/`, `build/`, `DerivedData/`. If either credential file was previously committed, rotate the keys in Firebase / Google Cloud Console — git history still has them.

### `project.pbxproj` discipline
Every Swift file added needs entries in all 4 sections: `PBXBuildFile`, `PBXFileReference`, the parent `PBXGroup` children list, and `PBXSourcesBuildPhase`. Missing any of them means silent build skip. For resources, swap `PBXSourcesBuildPhase` for `PBXResourcesBuildPhase`.

### Build verification protocol (no Xcode in this env)
Each phase runs two parallel sub-agent audits:
- **CHECK A** — static analysis: undefined types, missing imports, duplicate `@main`, duplicate symbols, asset name references, NavigationStack nesting.
- **CHECK B** — flow audit: NavigationLink destination types, EnvironmentObject providers, every symbol traced to a file registered in `PBXSourcesBuildPhase`.
Resolution rule: fix root cause, re-run both checks, only advance when both clean.

## V2 feature status (branch: `claude/insanity-league-ios-app-g73Jo`)

### Shipped (all committed + pushed)
- **FMK trade interest system** — Tinder swipe deck (right=Fuck, left=Kill, up=Marry), FMK-aware matching algorithm (bilateral F/M signals + ≤10% price parity), FMK summary + picker on player detail, league-wide FMK listener in AppState
- **Rosters** — horizontal chip team switcher, player row shows position only (not "WR · Jared"), NFL team row in player detail, Settings gear on every tab
- **League tab** — History tab (SeasonHistoryCard expand/collapse), off-season overlay on standings/scores when `isOffSeason = true`
- **Admin** — Jared-only gate (`email == "jaredrogtaylor@gmail.com"`, email check only — no isCommissioner dependency), Sync NFL Teams action, Seed League History action, Season Mode toggle
- **Settings page** — all users; profile (name read-only, ESPN team picker, nickname), appearance (logo icon presets), league prefs (default tab, show trade values, FMK privacy), sign out button, privacy policy link
- **Trade Portal** — full negotiate loop shipped: Accept/Decline/Counter buttons in TradeDetailView, CounterOfferView, counter-offer service (batch Firestore write), proposal notes, FMK → TradePreset pre-fills both sides of trade builder, chain history display, statusBadge with .countered case, Cloud Function (onTradeWrite, 2nd Gen Node 22) deployed to `iffl-auth` — push notifications live
- **Data model** — `FMKSignal`, `PlayerFMK`, `UserSettings`, `SeasonHistory`/`TeamFinish`, `nflTeam` on Player/DisplayAsset, `isOffSeason` on LeagueConfig, `beltWins` on FantasyTeam, `TradePreset`, `Trade.message`, `Trade.parentTradeId`, `TradeStatus.countered`
- **Privacy & legal** — `IFFLLegal.privacyPolicyURL` constant, consent notice on login screen, Privacy Policy link in Settings → About, policy hosted at `iffl-auth.web.app/privacy.html`
- **League history data** — ALL 17 seasons (2009–2025) seeded in `DataSeeder.historySeeds` including standings, records, notable trades. Run "Seed League History" from Admin > Database to push to Firestore.
- **Belt wins** — hardcoded in `DataModels.swift`: Jared 3, Bill 2, Ryan 2, Abad/Cantone/Faybik/M.Zurek/Wayne 1 each, others 0

### Current build
- **MARKETING_VERSION = 3.0, CURRENT_PROJECT_VERSION = 12** (build 12 submitted to App Store review June 2026)

### Pending / next session
- [x] **DEPLOY RESPONSIVE WEB APP** — ✅ DONE Aug 13, 2026. R1–R5 responsive redesign live at iffl-auth.web.app (desktop sidebar layout; phones unchanged). NOTE: repo path on Mac is `~/claude-agents/apps/iffl-web-app` (verified Aug 26 — earlier notes had two wrong paths). Build warning about 500kB+ chunk is cosmetic (Firebase SDK size); code-splitting is a future nice-to-have.
- [x] **EMAIL AUTO-LINK ONBOARDING** — ✅ LIVE Aug 13, 2026. `claimTeam` callable matches verified Google email against `config/league.teamEmailMap` → auto-assigns team on first sign-in. All 11 member emails entered via web Admin → Teams → Auto-Link by Email. League onboarding = just share iffl-auth.web.app. NOTE: one legacy @icloud.com auth account exists (Sign in with Apple era) — can't be used on web; that member auto-links via their Gmail instead.
- [x] **TRADE PORTAL v2 + GROUPME NOTIFICATIONS** — ✅ SHIPPED & VERIFIED LIVE Aug 13, 2026 (web). Incoming-offer badges + Dashboard banners, offer notes, counter-offer loop w/ chain history, ESPN execution checklist (players swap in ESPN / picks app-only), GroupMe DMs on propose/accept/decline/counter/execute via onTradeWrite (GROUPME_TOKEN secret in Secret Manager; team→GroupMe mapping in `config/groupme`, managed from web Admin → GroupMe). Jared confirmed end-to-end GroupMe test successful.
- [x] **ROOKIE DRAFT ROOM** — ✅ BUILT Aug 29, 2026 (hidden until opened).
  New `Rookie Draft` tab (`#rookie`), visible to the league only when
  `config/rookieDraft.live == true`; the commissioner always sees it.
  Order rules live in `web/src/services/draftOrder.js` (28 tests): 1.01–1.04
  lottery among the bottom four, 1.05–1.08 first-round playoff losers by
  inverse finish, 1.09–1.12 those who advanced with the champion at 1.12;
  round two repeats. Before the order exists the page shows who holds which
  generic 1sts/2nds, which is how the league trades them all year.
  **Only the slot's owner can pick**, enforced in `firestore.rules` against
  the published `config/rookieDraft.slotOwners` map (doc id is the slot, so
  two people can't take the same pick and a made pick can't be rewritten) —
  republish the board after any pick trade or the database still believes
  the old owner. Commissioner panel lives in the room: enter the order,
  publish, open/close, undo a pick, and "Push N to rosters" at the end
  (reuses `seedRookieClass`; R1 $2, R2 $1 on the +$5×years curve).
- [ ] **Trade Portal UX review** — superseded by web Trade Portal v2 (above); iOS flow unchanged
- [ ] **Retire legacy `PlayerInterest` collection** — old star-flag interest system superseded by FMK; remove once FMK is fully adopted
- [ ] **Firestore security rules** — add composite indexes for `playerFMK` (userId, assetId) and `leagueHistory` (year desc)
- [ ] **Honor `showTradeValues`** — toggle saved in UserSettings but not yet used to hide/show price columns in Rosters/Market
- [ ] **Cap threshold support** — data model and UI need to support a minimum cap floor in addition to the $300 cap ceiling. No minimum currently but coming. `LeagueConfig` will need a `capFloor` field. NOTE (Aug 2026): $200 = auction budget (THE planning number pre-draft); $300 = post-draft roster cap CEILING, not a budget. Constants in web/src/data/staticData.js.

## Backlog

### Customization
- [ ] **Custom app icon selector** — allow each user to choose their app icon from a set of presets (iOS alternate icons via `CFBundleAlternateIcons`). Add picker in Settings > Appearance.
- [ ] **ACCENT COLOR PICKER** — user picks their team color; entire app re-skins (cards, badges, tab bar glow, CTAs). Store in `UserSettings.accentColorName`.
- [ ] **Team banner image** — user uploads/picks a custom photo shown behind their team card on Dashboard. Store in Firebase Storage.
- [ ] **Custom team nickname** — displayed everywhere in the app instead of last name. Already in UserSettings model (`displayNickname`), just needs to propagate to all views.
- [ ] **Dark mode intensity** — pure black / current navy / charcoal slider in Settings > Appearance.
- [ ] **Dashboard layout + reorder** — toggle grid vs list for team cards; drag-to-reorder dashboard sections (My Team, Calendar, Trades, Messages, etc.).
- [ ] **Stat columns** — user chooses which columns appear on their roster view (salary, contract years, position, NFL team, etc.).
- [ ] **Trade card style** — compact vs expanded view in trades list.
- [ ] **FMK CARD ANIMATIONS** — let user pick swipe animation style: Tinder snap, fade, or spin-out. Add picker in Settings > Appearance.
- [ ] **TEAM COLOR THEME** — user picks primary color; app fully re-skins to that color across all surfaces, badges, and tab highlights.
- [ ] **DYNAMIC DASHBOARD WALLPAPER** — team's current record/rank generates a live gradient on the My Team card (winning = green glow, losing = red). Needs live ESPN scores integration (see below).
- [ ] **TROPHY CASE SCREEN** — personal stats page: career W-L record, championships, playoff record, total trades, best/worst seasons, belt wins as belt icons. Data source: `leagueHistory` Firestore collection (all 17 seasons seeded). Historical ESPN data + trade history 2022-2025 uploaded to session context.
- [ ] **Player card art (FMK)** — pull NFL headshots or generate pixel/illustrated art per player for the FMK swipe deck. Start with headshots from a public NFL image API; stretch goal: AI-generated art.
- [ ] **Text size preference** — small / medium / large font scale saved in UserSettings.

### Dashboard
- [ ] **IN-SEASON CHART** — when `isOffSeason == false`: previous week high scores across league, rolling avg points per game, top scorer at each position (QB/RB/WR/TE — no DST). Use Swift Charts (iOS 16+, no extra dependency). Data pulled from ESPN public API.
- [ ] **OFF-SEASON CHART** — when `isOffSeason == true`: historical season summary data — W-L trend over career, championship timeline, playoff appearances. Source: `leagueHistory` Firestore collection.
- [ ] **LIVE SCORES** — when `isOffSeason == false`, fetch live ESPN scores via their free public API (no key required) and show current week matchup score on Dashboard My Team card.

### POD / Content
- [ ] **Supplemental workbook integration** — during the weekly POD (the league's podcast/show), Jared shares Google Sheets workbooks live: "true record" (record adjusted for schedule luck), a standings/scoreboard sheet, and others as they come up episode to episode. Want these to also live on the website instead of staying POD-only, so members can check them anytime. Open questions before scoping:
  - Which sheets are the *recurring* ones (worth a permanent spot in the app) vs. one-off POD visuals that don't need to persist?
  - Live pull from Google Sheets (Sheets API — needs a service account + the sheet shared with it, updates automatically whenever Jared edits) vs. a manual import/sync into Firestore (more control, but someone has to trigger it each week)?
  - Where does it live in the app — a new section, folded into the existing League/History tabs, or something else?
  - Does "true record" already have an agreed formula, or does that need to be nailed down first (same kind of truth-up S0 did for scoring rules)?

### Infrastructure
- [ ] **Fastlane release automation** — one command (`fastlane beta`) to increment build number, archive, and upload to TestFlight. `fastlane/` folder already in `.gitignore`.
- [ ] **Merge open branches** — `claude/repo-cleanup-and-security` and `claude/claude-md-init` into main once build is confirmed working on device.
- [ ] **Rotate serviceAccountKey.json** — old key was committed to git history; rotate in Google Cloud Console.

### ESPN trade auto-import (webhook — needs one-time secret + Make.com wiring)
Trades that happen directly in ESPN (never proposed in this app) used to require manually re-entering them via Admin → Trades → Record External Trade. As of Aug 2026 there's a webhook (`exports.ingestEspnTrade` in `functions/index.js`) that the existing Gmail-scraper Make.com scenario can POST parsed trade emails to, and it applies them automatically.

**One-time setup on the Mac:**
```bash
# Generate a secret and set it (needed once; never in git)
openssl rand -hex 32
firebase functions:secrets:set TRADE_INGEST_SECRET
firebase deploy --only functions
```
Then in the Make.com scenario, add a final HTTP module: `POST https://us-central1-iffl-auth.cloudfunctions.net/ingestEspnTrade`, header `X-Ingest-Secret: <the secret above>`, JSON body:
```json
{
  "sourceId": "<Gmail message id — anything stable and unique per email>",
  "tradeDate": "2026-08-14T18:32:00Z",
  "moves": [
    { "player": "Justin Jefferson", "fromEspnTeam": "bill pony club", "toEspnTeam": "Shoot the Moon: IV" },
    { "player": "Patrick Mahomes",  "fromEspnTeam": "Shoot the Moon: IV", "toEspnTeam": "bill pony club" }
  ],
  "rawText": "optional — the raw email text, kept for audit only"
}
```
One `moves` entry per player that changed teams (`fromEspnTeam`/`toEspnTeam` are ESPN's own team names — the function resolves them against the p17 identity map in `functions/tradeIngest.js`, which must be kept in sync with `web/src/data/staticData.js`'s `espnName` fields if the league ever renames a team). Response is always 200 with `{ok:true, status: "applied"|"needs_review"|"duplicate"}` (or `ok:false` for a malformed request / bad secret) — Make can just log it.

### GroupMe trade signals (rewritten Aug 31, 2026 — the webhook is gone)
**Superseded design — read this, not the git history.** There was once an
`ingestGroupMeMessage` webhook and a `confirmPendingTrade` callable that
Make.com POSTed to. **Neither exists.** The GroupMe path is now a poller and
nothing else:

`exports.pollGroupMeTrades` (every 10 minutes) reads the league's trade
group directly, parses with `functions/groupmeParser.js`, and writes each
clean parse to `groupmeTradeSignals/{messageId}` with `status:
"unreviewed"`. No webhook, no relay, no `X-Ingest-Secret` for this path.
The commissioner reviews the queue in **Admin → Trade Signals**, which
calls `fs.setTradeSignalStatus`.

**GroupMe-sourced trades still never auto-apply**, which is the whole
point. GroupMe is free-text human chat, and real league history includes a
fake-out negotiation (numbers, a "YES," then "I BACKED OUT") that a keyword
scanner would have applied to live rosters. Trigger phrase is "official"
(as in "make it official"); the 🚨 emoji alone is NOT a trigger, because
real history shows it used for pure banter.

Team names resolve through `TEAM_ALIASES` in `functions/groupmeParser.js` —
extend it as nicknames appear. **An ambiguous "Zurek" is deliberately left
unresolved here**, which is the opposite of the trade-workbook converter,
where the commissioner has ruled that a bare Zurek is Matt. Different
because this scans unconfirmed live chat and that reads a finished record.

**Cadence is load-bearing:** pollGroupMeTrades (10 min) MUST lead
pollEspnGmail (15 min). `functions/tradeReconcile.js` Rule 4 holds an ESPN
trade that has no corroborating GroupMe signal, so the signal has to land
first. Don't retune either in isolation.

### The league feed (config/ifflFeed) — Jason's export
`exports.pollIfflFeed` (every 5 minutes) fetches `meta.json`, and only when
`last_changed_at` has advanced does it pull `league.json`, diff it against
Firestore and record the delta. **Report-only by default.** Applying is
armed per domain via `config/ifflFeed.armed = {players, picks, trades}`,
and even armed it refuses if the report contains problems.

Manage it from **Admin → Feed**: last run, last summary, apply errors, and
the three arm toggles. The rules allow the commissioner to write ONLY the
`armed` key on that document — the poller's cursor lives there too, and
rewinding it would re-import the whole league.

`history.json` (every ownership change, price change and auction, all
timestamped) is published by Jason but **never fetched**. It is the
untapped source for pre-2022 trade history. Feed URL lives in Secret
Manager and must never reach a browser — the unguessable path is the only
lock on it.

Assessment and open decisions: the "Jason's Feed, Assessed" artifact. The
unresolved blocker is whose contract math is the league's — ours (+$5 ×
years kept, waiver $2) vs his ($0-escalation, +$2 surcharge, daily FA
auctions). Every cap figure depends on it.

## TestFlight — manual steps (until Fastlane is set up)

1. Xcode toolbar → change destination to **"Any iOS Device (arm64)"**
2. `Product → Archive` (2-3 min)
3. Organizer opens → **Distribute App → App Store Connect → Upload** → keep all defaults → Upload
4. Wait 5–15 min for Apple to finish processing the build
5. [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → select **The Belt** app (bundle ID `com.thebelt.app`). NOTE: the rebrand changed the bundle ID, so this is a **new** app record — create it (name "The Belt", subtitle "Fantasy Football League") if it doesn't exist yet. The old IFFL record (`com.IFFLtest.CodeRed`) is abandoned.
6. **TestFlight** tab → **Internal Testing** → add yourself as tester → Save
7. Check email for TestFlight invite, or open the TestFlight app on iPhone directly

**Lessons learned (first TestFlight upload — under the old IFFL bundle id):**
- Register `com.thebelt.app` in developer.apple.com Identifiers (with Sign in with Apple capability) before it appears in App Store Connect's dropdown.
- "You need an invite from a developer" in TestFlight = you haven't added yourself as a tester yet in App Store Connect.
- Bundle ID must be registered in developer.apple.com Identifiers before it appears in App Store Connect's dropdown.

## V2 Scratchpad — Features Under Design

### 🏆 Belt Winner Icons on Team Cards
**Concept:** Each team card in the Dashboard grid shows mini belt icons below the team name — one icon per league championship won. Teams with zero belts show nothing extra.

**Mockup:**
```
┌──────────┐   ┌──────────┐   ┌──────────┐
│          │   │          │   │          │
│  [logo]  │   │  [logo]  │   │  [logo]  │
│          │   │          │   │          │
│  Jared   │   │   Ryan   │   │  Dugan   │
│  🏆🏆🏆  │   │    🏆    │   │          │
└──────────┘   └──────────┘   └──────────┘
```
- Icon: `crown.fill` SF Symbol in `beltGold` (#F4A261), ~12pt
- One icon per belt won, displayed as a horizontal row
- Fixed reserved space below team name so card height stays consistent

**Open questions before building:**
1. **Data source** — where does belt history live? Not in current data model. Options: hardcode in `DataModels.swift` alongside `fantasyTeams`, or add a `beltWinners` collection to Firestore.
2. **Belt icon** — `crown.fill` SF Symbol, `trophy.fill`, or a custom belt image asset you upload?
3. **Which belt** — league championship only, or is there a specific "title belt" concept (wrestling-style)?

---

### 🔄 Trade Portal — Needs Review
Current state: trade proposal builder works (select own assets + opponent assets, send). Pending + completed list in Market > Trades tab. Fixed post-V2: tapping "Propose Trade for X" on any player detail now auto-navigates to the builder with that player pre-selected.

**Still needed:**
- Push notification to receiving team when a trade is proposed (Cloud Function + FCM)
- Accept/decline flow review on device — confirm it feels intuitive
- Trade history context (assets traded, teams, date) — confirm sufficient

---

### 💬 Messaging — Needs Review
Current state: league messages shown as a horizontal scroll carousel on the Dashboard.

**Questions to answer during review:**
- Is the carousel the right pattern or should messages get their own tab/section?
- Who can send messages — commissioner only, or all managers?
- Should messages support replies/threads, or is broadcast-only fine?
- Missing: unread badge count?

---

## User context
- User is not a developer by trade. Explain git operations and Xcode steps with full paths and exact commands.
- User's repo also contains an unrelated Auto Show Notifier project on a separate branch — keep work scoped to The Belt.
