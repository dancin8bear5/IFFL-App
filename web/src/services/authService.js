// Google Sign-In — web equivalent of AuthenticationService in CodeRedApp.swift.
// iOS used GIDSignIn + GoogleAuthProvider.credential; on the web the same
// Google OAuth client backs signInWithPopup/-Redirect.
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth'
import { auth } from '../firebase'

const provider = new GoogleAuthProvider()

/** Popup on desktop; falls back to full-page redirect where popups are blocked (iOS Safari PWA). */
export async function signInWithGoogle() {
  try {
    await signInWithPopup(auth, provider)
  } catch (err) {
    if (
      err.code === 'auth/popup-blocked' ||
      err.code === 'auth/popup-closed-by-user' ||
      err.code === 'auth/cancelled-popup-request'
    ) {
      if (err.code === 'auth/popup-blocked') {
        await signInWithRedirect(auth, provider)
        return
      }
      return // user dismissed — not an error
    }
    throw err
  }
}

/** Mirrors AuthenticationService.signInWithEmail — same Firebase email/password accounts as iOS. */
export function signInWithEmail(email, password) {
  return signInWithEmailAndPassword(auth, email, password)
}

/** Mirrors Auth.auth().signOut() + GIDSignIn.signOut() — one call covers both on web. */
export function signOut() {
  return firebaseSignOut(auth)
}

/** Mirrors addStateDidChangeListener. Returns unsubscribe. */
export function listenToAuth(callback) {
  return onAuthStateChanged(auth, callback)
}
