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
cd ~/Documents/Claude/Projects/IFFL-App && pod install && open CodeRed.xcworkspace

# Deploy Cloud Functions
cd ~/Documents/Claude/Projects/IFFL-App && firebase deploy --only functions

# Deploy WEB APP + security rules (hosting serves web/dist — see web/DEPLOY.md)
cd ~/Documents/Claude/Projects/IFFL-App/web && npm run build && cd .. && firebase deploy --only hosting,firestore:rules

# Web app local dev (http://localhost:5173 — add ?preview=1 for sample data, no sign-in)
cd ~/Documents/Claude/Projects/IFFL-App/web && npm run dev

# Pull from active branch
cd ~/Documents/Claude/Projects/IFFL-App && git pull --no-rebase origin claude/insanity-league-ios-app-g73Jo
```

## Web app (`web/`) at a glance
- Vite + React 18 + Firebase JS SDK v10. Same Firebase project/collections as iOS — zero data migration.
- Structure mirrors iOS: `src/context/AppContext.jsx` = AppState; `src/services/firestoreService.js` = FirestoreDataService; `src/services/marketEngine.js` = MarketEngine (unit-tested, `npm test`).
- Auth: Google popup/redirect + email/password. Apple Sign-In intentionally omitted (was an App Store requirement only).
- `firestore.rules` (repo root): reads require league membership (uid in `config/league.userTeamMap` or `authorizedUIDs`); roster/config writes commissioner-only. Deployed with hosting.
- `web/.env` holds Firebase web config (from Console → Project settings → Your apps → Web). Never committed; template in `web/.env.example`.
- PWA: manifest + icons → Add to Home Screen gives near-native feel. `public/privacy.html` still served at `/privacy.html`.

## Project at a glance
- SwiftUI iOS app (iOS 17.0+), Firebase backend (Auth/Firestore/Messaging), Google Sign-In.
- Xcode project: `CodeRed.xcodeproj` — but **always open `CodeRed.xcworkspace`**.
- Bundle ID: `com.thebelt.app` (was `com.IFFLtest.CodeRed`; changed in The Belt rebrand → a NEW App Store Connect record). Dev team: `LNHDZQ76WT`.
- Firebase project: **IFFL Auth** (id `iffl-auth`, sender `876749980452`). The archived `codered-2b3b4` project is dead — never reference it.
- User's Mac path: `~/Documents/Claude/Projects/IFFL-App`.
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
- [ ] **Trade Portal UX review** — test accept/decline/counter flow on device once build 12 clears review
- [ ] **Retire legacy `PlayerInterest` collection** — old star-flag interest system superseded by FMK; remove once FMK is fully adopted
- [ ] **Firestore security rules** — add composite indexes for `playerFMK` (userId, assetId) and `leagueHistory` (year desc)
- [ ] **Honor `showTradeValues`** — toggle saved in UserSettings but not yet used to hide/show price columns in Rosters/Market
- [ ] **Cap threshold support** — data model and UI need to support a minimum cap floor in addition to the $300 cap ceiling. No minimum currently but coming. `LeagueConfig` will need a `capFloor` field.

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

### Infrastructure
- [ ] **Fastlane release automation** — one command (`fastlane beta`) to increment build number, archive, and upload to TestFlight. `fastlane/` folder already in `.gitignore`.
- [ ] **Merge open branches** — `claude/repo-cleanup-and-security` and `claude/claude-md-init` into main once build is confirmed working on device.
- [ ] **Rotate serviceAccountKey.json** — old key was committed to git history; rotate in Google Cloud Console.

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
