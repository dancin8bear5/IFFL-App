// Firebase initialization — same "IFFL Auth" project the iOS app uses.
// Config comes from web/.env (see .env.example). Nothing here is a secret:
// Firebase web API keys are public identifiers; security lives in Firestore rules.
import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const config = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
}

/** True when .env is filled in — the login screen shows a setup notice otherwise. */
export const isFirebaseConfigured = Boolean(config.apiKey && config.appId)

const app = initializeApp(
  isFirebaseConfigured
    ? config
    : { apiKey: 'demo', authDomain: 'demo.firebaseapp.com', projectId: 'demo', appId: 'demo' },
)

export const auth = getAuth(app)
export const db = getFirestore(app)

/** Lazy Cloud Functions client — initialized on first use so an unconfigured
 *  dev environment doesn't fail at module load. */
export async function getFunctionsClient() {
  const { getFunctions } = await import('firebase/functions')
  return getFunctions(app)
}
