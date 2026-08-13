// LoginView — port of LoginView in CodeRedApp.swift: Google + email/password.
// (Sign in with Apple was an App Store review requirement; not needed on web.)
import { useState } from 'react'
import { signInWithGoogle, signInWithEmail } from '../services/authService'
import { isFirebaseConfigured } from '../firebase'

export default function LoginView() {
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  async function run(fn) {
    setError(null)
    setBusy(true)
    try {
      await fn()
    } catch (err) {
      const friendly = {
        'auth/invalid-credential': 'Wrong email or password.',
        'auth/invalid-email': 'That email address doesn’t look right.',
        'auth/too-many-requests': 'Too many attempts — wait a minute and try again.',
      }
      setError(friendly[err.code] ?? err.message ?? 'Sign-in failed. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const handleGoogle = () => run(signInWithGoogle)
  const handleEmail = (e) => {
    e.preventDefault()
    if (email && password) run(() => signInWithEmail(email.trim(), password))
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%', maxWidth: 320 }}>
          <button className="btn-primary" onClick={handleGoogle} disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in with Google'}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <hr className="divider" style={{ flex: 1 }} />
            <span style={{ fontSize: 11, color: 'var(--iff-subtext)' }}>or</span>
            <hr className="divider" style={{ flex: 1 }} />
          </div>

          <form onSubmit={handleEmail} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input
              type="email"
              placeholder="Email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              type="password"
              placeholder="Password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="submit"
              className="btn-outline"
              disabled={busy || !email || !password}
              style={{ opacity: !email || !password ? 0.5 : 1 }}
            >
              Sign in with Email
            </button>
          </form>
        </div>
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
