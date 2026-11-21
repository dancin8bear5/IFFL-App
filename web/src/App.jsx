// Root — mirrors IFFLApp.swift: LoginView when signed out, tab shell when signed in.
import { useEffect, useRef, useState } from 'react'
import { useApp } from './context/AppContext'
import LoginView from './views/LoginView'
import TabLayout, { TABS } from './views/TabLayout'
import { tabForSlug } from './services/routing'
import { defaultTabSlug } from './services/defaultTab'

// Dev-only UI preview: `npm run dev` + ?preview=1 skips login so screens can be
// checked without signing in. import.meta.env.DEV is false in production builds,
// so this can never activate on the deployed site.
const DEV_PREVIEW =
  import.meta.env.DEV && new URLSearchParams(window.location.search).has('preview')

export default function App() {
  const { user, authReady, didLoadSettings, userSettings } = useApp()
  const [tab, setTab] = useState(0)
  const appliedDefaultTab = useRef(false)
  // Captured ONCE, at first render. TabLayout now writes the current tab
  // back into the hash, so by the time settings finish loading there is
  // always a hash — reading window.location.hash inside the effect below
  // would see that self-written value and permanently disable the saved
  // default-tab preference. What matters is whether the user ARRIVED on a
  // link, and only this first read can answer that.
  const arrivedOnDeepLink = useRef(
    typeof window !== 'undefined' && Boolean(window.location.hash),
  )

  // Apply the saved default tab once after settings load (mirrors iOS onChange).
  // A deep link outranks it: someone opening /#rosters/bill wants that
  // roster, not whatever tab they normally start on.
  useEffect(() => {
    if (arrivedOnDeepLink.current) { appliedDefaultTab.current = true; return }
    if (didLoadSettings && !appliedDefaultTab.current) {
      appliedDefaultTab.current = true
      // By slug, never by position: the saved number used to be handed
      // straight to setTab, and went wrong the day the tab list changed.
      const t = tabForSlug(TABS, defaultTabSlug(userSettings))
      if (t >= 0) setTab(t)
    }
  }, [didLoadSettings, userSettings.defaultTab, userSettings.defaultTabSlug])

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
