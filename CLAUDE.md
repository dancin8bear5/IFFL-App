# IFFL App — Working Notes

> **Always open `CodeRed.xcworkspace`** — not `CodeRed.xcodeproj`, not any other workspace file. The workspace is what links CocoaPods (Firebase, Google Sign-In). Opening the bare project gives "Firebase module not found".

## Pinned Commands

```bash
# Pull latest + pod install + open Xcode (run this before every archive)
cd ~/Documents/Claude/Projects/IFFL-App && pod install && open CodeRed.xcworkspace

# Deploy Cloud Functions
cd ~/Documents/Claude/Projects/IFFL-App && firebase deploy --only functions

# Deploy privacy policy / hosting
cd ~/Documents/Claude/Projects/IFFL-App && firebase deploy --only hosting

# Pull from active branch
cd ~/Documents/Claude/Projects/IFFL-App && git pull --no-rebase origin claude/insanity-league-ios-app-g73Jo
```

## Project at a glance
- SwiftUI iOS app (iOS 17.0+), Firebase backend (Auth/Firestore/Messaging), Google Sign-In.
- Xcode project: `CodeRed.xcodeproj` — but **always open `CodeRed.xcworkspace`**.
- Bundle ID: `com.IFFLtest.CodeRed`. Dev team: `LNHDZQ76WT`.
- Firebase project: **IFFL Auth** (id `iffl-auth`, sender `876749980452`). The archived `codered-2b3b4` project is dead — never reference it.
- User's Mac path: `~/Documents/Claude/Projects/IFFL-App`.
- Branch protection on `main` — pushes are rejected, PRs required.
- Active development branch: `claude/insanity-league-ios-app-g73Jo`.

## Architecture
- Environment-driven SwiftUI: single `AppState: ObservableObject` injected via `.environmentObject`. No full MVVM.
- `AuthenticationService` separate `ObservableObject` for auth only.
- `MarketEngine` pure struct with static methods (zero Firebase deps, used for mutual-interest matching).
- One `NavigationStack` per tab — never nest NavigationStacks inside sheets.
- `@main` lives in `App/IFFLApp.swift`. `App/CodeRedApp.swift` holds AppState, AuthenticationService, AppDelegate, LoginView, and shared subviews — no `@main`.

## Folder structure (current — Views/ is still flat)
```
App/             IFFLApp.swift, IFFLTheme.swift, CodeRedApp.swift
Models/          DataModels.swift
Services/        FirestoreDataService.swift, DataSeeder.swift, MarketEngine.swift
Views/           AdminView.swift, DashboardView.swift, RostersView.swift, MarketView.swift,
                 LeagueView.swift, WebViewContainer.swift,
                 FMKSwiperView.swift, LeagueHistoryView.swift, SettingsView.swift  ← added V2
Info.plist       CFBundleURLTypes (Google Sign-In) + FirebaseAppDelegateProxyEnabled=false
GoogleService-Info.plist   NOT in git — local only on Mac
serviceAccountKey.json     NOT in git — server credentials, must never ship in iOS bundle
```

## Design system (`IFFLTheme.swift`)
Color tokens (hex → use): `iffBg #0A0D1A` (screens), `iffSurface #141827` (cards), `iffElevated #1E2235` (modals), `iffAccent #E63946` (CTAs/active), `iffGold #F4A261` (prices), `iffText #FFFFFF`, `iffSubtext #9EA8B8`. xcassets colorsets are aligned to the same hex values so AdminView's `Color("BackgroundColor")` calls produce identical output to `Color.iffBg`.

## Hard-won lessons (read before touching these areas)

### Xcode `INFOPLIST_KEY_*` is scalar-only
Do **not** embed XML as a string in `INFOPLIST_KEY_CFBundleURLTypes` (or any nested-structure key). Xcode serializes it as a plain string, not a real array — Google Sign-In's runtime check finds no schemes and throws `NSInvalidArgumentException`.
**Fix pattern:** real `Info.plist` at repo root with the nested key, plus `INFOPLIST_FILE = Info.plist` in both Debug and Release. Keep `GENERATE_INFOPLIST_FILE = YES` so Xcode still merges in the scalar `INFOPLIST_KEY_*` values (orientations, scene manifest, etc.).

### `REVERSED_CLIENT_ID` is a build variable
`Info.plist` references `$(REVERSED_CLIENT_ID)`. The actual value lives as a user-defined build setting in `project.pbxproj` for both Debug and Release: `com.googleusercontent.apps.876749980452-oibgt1c35fdla5rufbrslapqg8kf6fsd`. If this drifts from `GoogleService-Info.plist`'s `REVERSED_CLIENT_ID`, Firebase Auth returns `CONFIGURATION_NOT_FOUND` (code 17999).

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
- **Settings page** — all users; profile (name read-only, ESPN team picker, nickname), appearance (logo icon presets), league prefs (default tab, show trade values, FMK privacy), notifications placeholder
- **Data model** — `FMKSignal`, `PlayerFMK`, `UserSettings`, `SeasonHistory`/`TeamFinish`, `nflTeam` on Player/DisplayAsset, `isOffSeason` on LeagueConfig, `beltWins` on FantasyTeam (all = 0)
- **Bug fixes (post-device-test)** — player detail subtitle shows position only; trade proposal flow auto-pushes `TradeProposalView` when triggered from player detail; Settings ESPN Team is a picker so wrong team mapping can be self-corrected

### Needs user data before features are live
- **League history** — `DataSeeder.historySeeds` is an empty array. Jared must provide year-by-year champions/standings/notable trades; then run "Seed League History" from Admin > Database.
- **NFL team mapping** — `DataSeeder.nflTeamMapping` has a starter dict; run "Sync NFL Teams" from Admin > Database to apply. Refresh 2-3x/year.
- **Belt wins** — `beltWins: Int = 0` for all 12 teams in `DataModels.swift`. Fill in once league history is loaded (or hardcode from memory).

### Pending / next session
- [ ] **Push notifications for trade proposals** — receiving team needs FCM notification when a trade is proposed. Firestore write already happens; just needs Cloud Function trigger + FCM send.
- [ ] **Trade Portal UX review** — test accept/decline flow on device; confirm pending trades are surfaced clearly
- [ ] **Retire legacy `PlayerInterest` collection** — old star-flag interest system superseded by FMK; remove once FMK is fully adopted
- [ ] **Firestore security rules** — add composite indexes for `playerFMK` (userId, assetId) and `leagueHistory` (year desc)
- [ ] **Honor `showTradeValues`** — toggle saved in UserSettings but not yet used to hide/show price columns in Rosters/Market

## Backlog

- [ ] **Fastlane release automation** — one command (`fastlane beta`) to increment build number, archive, and upload to TestFlight. `fastlane/` folder already in `.gitignore`.
- [ ] **Merge open branches** — `claude/repo-cleanup-and-security` and `claude/claude-md-init` into main once build is confirmed working on device.
- [ ] **Rotate serviceAccountKey.json** — old key was committed to git history; rotate in Google Cloud Console.

## TestFlight — manual steps (until Fastlane is set up)

1. Xcode toolbar → change destination to **"Any iOS Device (arm64)"**
2. `Product → Archive` (2-3 min)
3. Organizer opens → **Distribute App → App Store Connect → Upload** → keep all defaults → Upload
4. Wait 5–15 min for Apple to finish processing the build
5. [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → find the **existing** IFFL app (bundle ID `com.IFFLtest.CodeRed`) — do NOT create a new app, it already exists
6. **TestFlight** tab → **Internal Testing** → add yourself as tester → Save
7. Check email for TestFlight invite, or open the TestFlight app on iPhone directly

**Lessons learned (first TestFlight upload):**
- The app record already existed in App Store Connect — creating a new one fails because `com.IFFLtest.CodeRed` is already taken. Always look for the existing record first.
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
- Icon: `crown.fill` SF Symbol in `iffGold` (#F4A261), ~12pt
- One icon per belt won, displayed as a horizontal row
- Fixed reserved space below team name so card height stays consistent

**Open questions before building:**
1. **Data source** — where does belt history live? Not in current data model. Options: hardcode in `DataModels.swift` alongside `fantasyTeams`, or add a `beltWinners` collection to Firestore.
2. **Belt icon** — `crown.fill` SF Symbol, `trophy.fill`, or a custom belt image asset you upload?
3. **Which belt** — league championship only, or is there a specific IFFL "title belt" concept (wrestling-style)?

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
- User's repo also contains an unrelated Auto Show Notifier project on a separate branch — keep work scoped to IFFL.
