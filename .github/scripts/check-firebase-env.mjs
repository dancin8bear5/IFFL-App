// check-firebase-env — refuse to build the web app with a Firebase config
// that cannot work.
//
// Why this exists: on Sep 26, 2026 a deploy shipped with a VITE_FIREBASE_API_KEY
// that Firebase rejected. Every gate passed — unit tests, rules, the preview
// smoke and the live smoke — because none of them signs in, and the login
// screen renders whatever the key says. The league got
// "auth/api-key-not-valid" on the front page and nobody was told.
//
// The values are checked for SHAPE, not for correctness — only Google can say
// whether a key is real, and e2e/live.spec.js now asks it. What this catches is
// the whole family of "the secret is missing, truncated, quoted, pasted into
// the wrong box, or from another project", which is what actually goes wrong.
//
// Not a secret: a Firebase web API key ships in the built bundle and is a
// public identifier. It is a repo secret only so the value lives in one place.

/** The project these values must belong to. Same constants the workflow writes. */
export const PROJECT_SENDER_ID = '876749980452'

/**
 * @returns array of human-readable problems; empty means the config can work.
 */
export function validateFirebaseEnv(env = {}) {
  const problems = []
  const key = env.VITE_FIREBASE_API_KEY
  const appId = env.VITE_FIREBASE_APP_ID

  if (!key) {
    problems.push('VITE_FIREBASE_API_KEY is empty — the GitHub secret is missing or unset.')
  } else if (key !== key.trim()) {
    problems.push('VITE_FIREBASE_API_KEY has leading or trailing whitespace.')
  } else if (/^["']|["']$/.test(key)) {
    problems.push('VITE_FIREBASE_API_KEY is wrapped in quotes — store the bare value.')
  } else if (!/^AIza[0-9A-Za-z_-]{35}$/.test(key)) {
    problems.push(
      `VITE_FIREBASE_API_KEY is not shaped like a Google API key (expected AIza… and 39 characters, got ${key.length}).`,
    )
  }

  if (!appId) {
    problems.push('VITE_FIREBASE_APP_ID is empty — the GitHub secret is missing or unset.')
  } else if (appId !== appId.trim()) {
    problems.push('VITE_FIREBASE_APP_ID has leading or trailing whitespace.')
  } else if (!/^1:\d+:web:[0-9a-zA-Z]+$/.test(appId)) {
    problems.push(`VITE_FIREBASE_APP_ID is not shaped like a web app id (expected 1:<sender>:web:…, got "${appId}").`)
  } else if (appId.split(':')[1] !== PROJECT_SENDER_ID) {
    problems.push(
      `VITE_FIREBASE_APP_ID belongs to sender ${appId.split(':')[1]}, not ${PROJECT_SENDER_ID} — that is a different Firebase project.`,
    )
  }

  // The classic paste error, worth naming precisely rather than reporting twice.
  if (key?.startsWith('1:') && appId?.startsWith('AIza')) {
    return ['VITE_FIREBASE_API_KEY and VITE_FIREBASE_APP_ID are swapped.']
  }

  return problems
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const problems = validateFirebaseEnv(process.env)
  if (problems.length) {
    for (const p of problems) console.log(`::error::${p}`)
    console.log(
      '\nFix: repo → Settings → Secrets and variables → Actions. The correct values are the ones in web/.env on the deploy Mac (estate-managed), or Firebase Console → Project settings → General → Your apps → Web.',
    )
    process.exit(1)
  }
  console.log('Firebase web config looks well-formed.')
}
