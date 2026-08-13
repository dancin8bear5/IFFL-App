// Root — mirrors IFFLApp.swift: LoginView when signed out, tab shell when signed in.
import { useState } from 'react'
import { useApp } from './context/AppContext'
import LoginView from './views/LoginView'
import TabLayout from './views/TabLayout'

// Dev-only UI preview: `npm run dev` + ?preview=1 skips login so screens can be
// checked without signing in. import.meta.env.DEV is false in production builds,
// so this can never activate on the deployed site.
const DEV_PREVIEW =
  import.meta.env.DEV && new URLSearchParams(window.location.search).has('preview')

export default function App() {
  const { user, authReady } = useApp()
  const [tab, setTab] = useState(0)

  if (DEV_PREVIEW) return <TabLayout tab={tab} setTab={setTab} />

  if (!authReady) {
    return (
      <div className="app-frame" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--iff-subtext)', fontSize: 14 }}>Loading…</div>
      </div>
    )
  }

  if (!user) return <LoginView />

  return <TabLayout tab={tab} setTab={setTab} />
}
