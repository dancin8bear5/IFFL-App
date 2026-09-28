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
/**
 * Why a value can't be what it claims to be — the shape of the MISTAKE, not
 * of the value. Never echo the value itself: these run in a public log, and
 * a secret GitHub masks is only masked when it matches the stored string
 * exactly, which a substring of it does not.
 *
 * Multi-line comes first because it is the one that works by accident. Paste
 * the key and the APP_ID line together and the build still succeeds — the
 * newline ends the key, and the second line lands in .env as its own valid
 * entry. That is how a malformed secret survives unnoticed until something
 * finally looks at it (Sep 27, 2026: the key secret carried the APP_ID line
 * too, 103 characters where 39 belong).
 */
function malformed(name, value) {
  // Count the lines that carry something: a value with a trailing newline is
  // one value with stray whitespace, not two lines, and saying "1 lines" to
  // someone trying to fix a deploy at midnight helps nobody.
  const lines = value.split(/\r?\n/).filter((l) => l.trim()).length
  if (lines > 1) {
    return `${name} contains ${lines} lines — it looks like more than one .env line was pasted in. The secret holds ONE value: just the key itself, no name, no "=", nothing after it.`
  }
  if (value.includes('=')) {
    return `${name} contains "=" — it looks like a whole NAME=value line was pasted. Store only the part after the "=".`
  }
  if (value !== value.trim()) return `${name} has leading or trailing whitespace.`
  if (/^["']|["']$/.test(value)) return `${name} is wrapped in quotes — store the bare value.`
  if (/\s/.test(value)) return `${name} contains a space, so it is not a single value.`
  return null
}

export function validateFirebaseEnv(env = {}) {
  const problems = []
  const key = env.VITE_FIREBASE_API_KEY
  const appId = env.VITE_FIREBASE_APP_ID

  if (!key) {
    problems.push('VITE_FIREBASE_API_KEY is empty — the GitHub secret is missing or unset.')
  } else if (malformed('VITE_FIREBASE_API_KEY', key)) {
    problems.push(malformed('VITE_FIREBASE_API_KEY', key))
  } else if (!/^AIza[0-9A-Za-z_-]{35}$/.test(key)) {
    problems.push(
      `VITE_FIREBASE_API_KEY is not shaped like a Google API key (expected AIza… and 39 characters, got ${key.length}).`,
    )
  }

  if (!appId) {
    problems.push('VITE_FIREBASE_APP_ID is empty — the GitHub secret is missing or unset.')
  } else if (malformed('VITE_FIREBASE_APP_ID', appId)) {
    problems.push(malformed('VITE_FIREBASE_APP_ID', appId))
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
