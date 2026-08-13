# Insanity League Web — Deploy Guide

The web app lives in `web/` and deploys to **Firebase Hosting** on the same
`iffl-auth` project the app already uses. One deploy gives you a URL like
`https://iffl-auth.web.app` that every league member can open on any phone.

## One-time setup (on your Mac)

### 1. Get the Firebase web config

1. Open [console.firebase.google.com](https://console.firebase.google.com) → **IFFL Auth** project
2. Gear icon → **Project settings** → **General** tab
3. Scroll to **Your apps**. If there's no Web app yet, click **Add app** → the `</>` (Web) icon → name it `Insanity League Web` → Register (skip the SDK snippet)
4. Copy the config values shown (apiKey, appId, etc.)

### 2. Create web/.env

```bash
cd ~/Documents/Claude/Projects/IFFL-App/web   # adjust if the repo moved
cp .env.example .env
open -e .env
```

Paste in the two missing values (`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_APP_ID`).
The other three are already filled in.

### 3. Install tools

```bash
npm install                 # web app dependencies (run inside web/)
npm install -g firebase-tools
firebase login              # opens browser, sign in with jaredrogtaylor@gmail.com
```

## Deploying (every time)

```bash
cd ~/Documents/Claude/Projects/IFFL-App
cd web && npm run build && cd ..
firebase deploy --only hosting,firestore:rules
```

That's it. The site is live at **https://iffl-auth.web.app** within seconds.

> The first deploy also publishes `firestore.rules`, which locks the database
> to league members. **Do this before sharing the URL.**

## Why sign-in works with zero extra config

Firebase Hosting domains (`iffl-auth.web.app` / `iffl-auth.firebaseapp.com`)
are pre-authorized for Firebase Auth — Google Sign-In works there out of the
box. No OAuth console changes needed.

## Getting the league on board

Send everyone this message:

> 🏈 The league app is live! Open **https://iffl-auth.web.app** on your phone,
> sign in with Google, then tap Share → **Add to Home Screen**. It installs
> like a regular app.

Each member's first sign-in creates their account. Then you (commissioner)
assign them a team: **Admin tab → Teams → paste their UID → pick team →
Assign.** Members can see their UID under Admin → Access (or you can look in
Firebase Console → Authentication).

Until a member is assigned a team, the database rules block their reads —
so a random Google account that finds the URL sees nothing.

## Local development

```bash
cd web
npm run dev            # http://localhost:5173
```

- `?preview=1` on the dev URL loads sample data with no sign-in (dev only,
  never works on the deployed site).
- `npm test` runs the market-engine unit tests.

## Custom domain (optional, later)

Firebase Console → Hosting → **Add custom domain** walks you through DNS.
`insanityleague.com` could point at this app if you own it.
