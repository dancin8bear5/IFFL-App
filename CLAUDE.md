# IFFL App — Working Notes

> **Always open `CodeRed.xcworkspace`** — not `CodeRed.xcodeproj`, not any other workspace file. The workspace is what links CocoaPods (Firebase, Google Sign-In). Opening the bare project gives "Firebase module not found".

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
Views/           AdminView.swift, DashboardView.swift, RostersView.swift, MarketView.swift, LeagueView.swift, WebViewContainer.swift
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

## User context
- User is not a developer by trade. Explain git operations and Xcode steps with full paths and exact commands.
- User's repo also contains an unrelated Auto Show Notifier project on a separate branch — keep work scoped to IFFL.
