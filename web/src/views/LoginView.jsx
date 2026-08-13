// LoginView — port of LoginView in CodeRedApp.swift. Google Sign-In only.
import { useState } from 'react'
import { signInWithGoogle } from '../services/authService'
import { isFirebaseConfigured } from '../firebase'

export default function LoginView() {
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function handleSignIn() {
    setError(null)
    setBusy(true)
    try {
      await signInWithGoogle()
    } catch (err) {
      setError(err.message ?? 'Sign-in failed. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="app-frame"
      style={{ alignItems: 'center', justifyContent: 'center', gap: 28, padding: 32 }}
    >
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            fontSize: 54,
            fontWeight: 900,
            fontStyle: 'italic',
            letterSpacing: '-2px',
            color: 'var(--iff-accent)',
            lineHeight: 1.05,
          }}
        >
          Insanity League
        </div>
        <div style={{ fontSize: 12, color: 'var(--iff-subtext)', marginTop: 8 }}>
          Fantasy Football League
        </div>
        <div
          style={{
            fontSize: 9,
            fontWeight: 700,
            color: 'rgba(158,168,184,0.5)',
            letterSpacing: 4,
            marginTop: 4,
          }}
        >
          EST. 2008
        </div>
      </div>

      {isFirebaseConfigured ? (
        <button className="btn-primary" onClick={handleSignIn} disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in with Google'}
        </button>
      ) : (
        <div
          className="iff-card"
          style={{ padding: 20, maxWidth: 340, fontSize: 13, lineHeight: 1.6, color: 'var(--iff-subtext)' }}
        >
          <strong style={{ color: 'var(--iff-text)' }}>Setup needed:</strong> copy{' '}
          <code>web/.env.example</code> to <code>web/.env</code> and fill in the Firebase web
          config from the Firebase Console (project <code>iffl-auth</code>), then restart the dev
          server.
        </div>
      )}

      {error && (
        <div style={{ color: 'var(--iff-accent)', fontSize: 13, maxWidth: 320, textAlign: 'center' }}>
          {error}
        </div>
      )}
    </div>
  )
}
