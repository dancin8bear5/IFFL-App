# IFFL App — Working Notes

## Project at a glance
- SwiftUI iOS app (iOS 17.0+), Firebase backend (Auth/Firestore/Messaging), Google Sign-In.
- Xcode project: `CodeRed.xcodeproj` (but **always open `CodeRed.xcworkspace`** — CocoaPods).
- Bundle ID: `com.IFFLtest.CodeRed`. Dev team: `LNHDZQ76WT`.
- User's Mac path: `~/Documents/Claude/Projects/IFFL-App`.
- Branch protection on `main` — pushes are rejected, PRs required.
- Development branch for this work: `claude/insanity-league-ios-app-g73Jo` (merged in PR #2).

## Architecture
- Environment-driven SwiftUI: single `AppState: ObservableObject` injected via `.environmentObject`. No full MVVM.
- `AuthService` separate `ObservableObject` for auth only.
- `MarketEngine` pure struct with static methods (zero Firebase deps, used for mutual-interest matching).
- One `NavigationStack` per tab — never nest NavigationStacks inside sheets.
- `@main` lives in `App/IFFLApp.swift` only. `CodeRedApp.swift` was rewritten without `@main`.

## Folder structure (after Phase 1 restructure)
```
App/             IFFLApp.swift, IFFLTheme.swift, AppState.swift, AppDelegate.swift, AuthService.swift, CodeRedApp.swift
Models/          DataModels.swift
Services/        FirestoreDataService.swift, DataSeeder.swift, MarketEngine.swift
Views/
  Auth/          LoginView.swift
  Dashboard/     DashboardView.swift
  Rosters/       RostersView.swift (+ TeamRosterView, AllAssetsView, RosterDetailView inline)
  Market/        MarketView.swift, TradeProposalView.swift
  League/        LeagueView.swift, WebViewContainer.swift
  Admin/         AdminView.swift
  Shared/        AssetDetailView, AssetRow, TradeDetailView, HistoricalTradesView
    Components/  IFFLCard.swift, LoadingView (in IFFLTheme.swift)
```

## Design system (IFFLTheme.swift)
Color tokens (hex → use): `iffBg #0A0D1A` (screens), `iffSurface #141827` (cards), `iffElevated #1E2235` (modals), `iffAccent #E63946` (CTAs/active), `iffGold #F4A261` (prices), `iffText #FFFFFF`, `iffSubtext #9EA8B8`.
xcassets colorsets were aligned to these same hex values so AdminView's `Color("BackgroundColor")` calls produce identical output to `Color.iffBg`.

## Hard-won lessons (read before touching these areas)

### Xcode `INFOPLIST_KEY_*` is scalar-only
**Do not** embed XML as a string in `INFOPLIST_KEY_CFBundleURLTypes` (or any nested-structure key). Xcode's auto-generated Info.plist serializes the value as a string, not as a real array — Google Sign-In's runtime check finds no schemes and throws `NSInvalidArgumentException`.
**Fix pattern:** create a real `Info.plist` with the nested key, set `INFOPLIST_FILE = Info.plist` in both Debug and Release configs. Keep `GENERATE_INFOPLIST_FILE = YES` so Xcode merges in the other scalar `INFOPLIST_KEY_*` values (orientations, scene manifest, etc.).
Reference: PR #5 / `/Info.plist`.

### CocoaPods workflow on Mac
- After cloning or pulling: `pod install` must run, then **open `CodeRed.xcworkspace`** (not `.xcodeproj`). Opening the bare project gives "Firebase module not found".
- gRPC-Core fails simulator builds with `Command CodeSign failed`. Fix in `Podfile` post_install: `config.build_settings['CODE_SIGNING_ALLOWED'] = 'NO'`.
- `pod install` needs significant disk space (Firebase headers). If `Errno::ENOSPC`, clear `~/Library/Developer/Xcode/DerivedData/*` and `xcrun simctl delete unavailable` before retry.
- The user's Mac has local Podfile customizations — `git pull` often conflicts. Standard recovery: `git stash && git pull origin main && git stash pop`.

### `project.pbxproj` discipline
Every Swift file added needs entries in all 4 sections: `PBXBuildFile`, `PBXFileReference`, the parent `PBXGroup` children list, and `PBXSourcesBuildPhase`. Missing any of them means silent build skip.

### Build verification protocol (no Xcode in this env)
Each phase ran two parallel sub-agent audits:
- **CHECK A** — static analysis: undefined types, missing imports, duplicate `@main`, duplicate symbols, asset name references, NavigationStack nesting.
- **CHECK B** — flow audit: NavigationLink destination types, EnvironmentObject providers, every symbol traced to a file registered in `PBXSourcesBuildPhase`.
Resolution rule: fix root cause, re-run both checks, only advance when both clean.

## Active issues / open threads
- **Google Sign-In completes browser auth but Firebase Auth returns "internal error"** on home screen after returning to app. RBS assertion in log is noise; the real error is from Firebase Auth's credential exchange. Likely causes to investigate first:
  1. Firebase Console → Authentication → Sign-in method → Google provider not enabled, or Web client ID mismatch.
  2. `GIDSignIn` `clientID` not passed to Firebase, or `GoogleService-Info.plist` `CLIENT_ID` doesn't match the Web client ID Firebase expects.
  3. Bundle ID `com.IFFLtest.CodeRed` not registered as an iOS OAuth client in Google Cloud Console.

## User context
- User is not a developer by trade. Explain git operations and Xcode steps with full paths and exact commands.
- User's repo also contains an unrelated Auto Show Notifier project on a separate branch — keep work scoped to IFFL.
