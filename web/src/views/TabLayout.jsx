// TabLayout — app shell.
// Mobile (<900px): bottom tab bar. Desktop (≥900px): left sidebar.
// Six tabs; Admin lives inside Settings (commissioner only), and the old
// League tab was absorbed — standings sit on the Dashboard, history opens
// from the Dashboard tiles, and Rules is its own tab.
// The commissioner can switch any tab off league-wide (Admin > Areas);
// Dashboard is always on, and the admin account always sees everything.
import { lazy, Suspense, useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { FMK_ENABLED } from '../data/staticData'
import { normalizeHash, slugForTab, tabForSlug } from '../services/routing'
import { useIsDesktop } from '../hooks/useBreakpoint'
import Sidebar from '../components/Sidebar'
import ErrorBoundary from '../components/ErrorBoundary'
import { LoadingList } from '../components/shared'
import DashboardView from './DashboardView'

// Only the Dashboard ships in the initial bundle — it's the landing tab
// and the only one guaranteed to be needed. The rest load the first time
// they're opened, which is what keeps the first paint on a phone quick.
const RostersView = lazy(() => import('./RostersView'))
const PlayersView = lazy(() => import('./PlayersView'))
const MarketView = lazy(() => import('./MarketView'))
const BuilderView = lazy(() => import('./BuilderView'))
const PodView = lazy(() => import('./PodView'))
const BigBoardView = lazy(() => import('./BigBoardView'))

// `label` shows in the desktop sidebar; `short` fits the mobile tab bar.
// `podOnly` marks a tab only the three POD hosts can see; `adminOnly`
// marks one only the commissioner sees (the Big Board is his private
// keeper planning, including calls on other people's players).
// `slug` is the tab's URL: iffl-auth.web.app/#rosters. Slugs are part of
// the app's public surface once someone shares one, so treat them as
// permanent — rename the LABEL freely, but retire a slug only by adding
// an alias in services/routing.js.
const TABS = [
  { label: 'Dashboard',        short: 'Dashboard', glyph: '▦',  slug: 'dashboard' },  // always on
  { label: 'Rosters',          short: 'Rosters',   glyph: '👥', slug: 'rosters',   area: 'rosters' },
  { label: 'Players',          short: 'Players',   glyph: '🔎', slug: 'players',   area: 'players' },
  { label: 'F.M.K. Market',    short: 'F.M.K.',    glyph: '⇄',  slug: 'trades',    area: 'market', fmkLabel: true },
  { label: 'myTeam Worksheet', short: 'Worksheet', glyph: '🧪', slug: 'worksheet', area: 'builder' },
  { label: 'The POD',          short: 'POD',       glyph: '🎙️', slug: 'pod',       podOnly: true },
  { label: 'Big Board',        short: 'Board',     glyph: '📋', slug: 'board',     adminOnly: true, urlOnly: true },
]

export default function TabLayout({ tab, setTab }) {
  const { incomingTradeCount, areaEnabled, isPodMember, isAdmin, bigBoardInNav, isInitialLoadComplete } = useApp()
  const isDesktop = useIsDesktop()

  // Indices stay stable (setTab(3) is always Market); hidden tabs just
  // vanish from the nav, and landing on one falls back to the Dashboard.
  // canSee gates the SCREEN — reaching a tab at all. inNav gates whether it
  // also gets a button. The Big Board is the one tab where those differ: it
  // stays reachable at its #board URL while sitting out of the navigation.
  const canSee = (t) =>
    t.podOnly ? isPodMember
      : t.adminOnly ? isAdmin
      : !t.area || areaEnabled(t.area)
  const inNav = (t) => canSee(t) && (!t.urlOnly || bigBoardInNav)
  // With F.M.K. switched off this tab is only the trade portal, so calling
  // it "F.M.K. Market" would advertise a section that isn't there.
  //
  // The rename resolves at RENDER time rather than by remapping the array:
  // both navs locate a tab with TABS.indexOf(t), so handing them freshly
  // spread copies would return -1 and break tab switching outright.
  // FMK_ENABLED is a hard constant, not the admin-exempt area switch, so
  // this reads "Trades" for the commissioner too.
  const labelOf = (t) => (t?.fmkLabel && !FMK_ENABLED ? 'Trades' : t?.label)
  const shortOf = (t) => (t?.fmkLabel && !FMK_ENABLED ? 'Trades' : t?.short)
  const visibleTabs = TABS.filter(inNav)
  const activeTab = TABS[tab] && !canSee(TABS[tab]) ? 0 : tab

  // ── URL ↔ tab, both directions ───────────────────────────────
  //
  // One ref keeps the two halves from fighting. `syncedSlug` is the slug
  // the URL and the tab currently agree on, and it is set by WHICHEVER
  // side moved first. The alternative — having the writer re-read
  // window.location.hash to decide whether to push — looks equivalent and
  // isn't: on a Back navigation the browser's hash commit and React's
  // re-render race, and losing that race pushes a duplicate entry, so
  // pressing Back twice lands you where you started.
  const syncedSlug = useRef(null)
  const stamped = useRef(false)
  // A deep link has to outlive the permission check. On a cold load the
  // read effect runs before isAdmin/isPodMember resolve, so #board looks
  // forbidden for a moment — and without this the writer would stamp
  // #dashboard over it and the link would be lost before it was ever
  // fairly evaluated. `pendingSlug` holds the arriving link and blocks the
  // writer until it's either applied or genuinely refused.
  const pendingSlug = useRef(
    typeof window !== 'undefined' ? normalizeHash(window.location.hash) || null : null,
  )
  // canSee closes over props; the listener is registered once, so it reads
  // the current one through a ref instead of going stale.
  const canSeeRef = useRef(canSee)
  canSeeRef.current = canSee
  // The tab the reader has asked for but React hasn't rendered yet. Both
  // effects run in the SAME commit, so the writer would otherwise see the
  // pre-update activeTab — on a cold /#board load it read 0, decided the
  // URL was wrong, and stamped #dashboard over the link that had just been
  // resolved correctly one line earlier.
  const requestedTab = useRef(null)
  // The reader is registered once, so it reads the live tab through a ref.
  const activeTabRef = useRef(0)

  // Read: the hash picks the tab, on load and on hashchange — which is
  // what Back and Forward fire. Gated by canSee, not inNav: a tab can be
  // absent from the navigation and still reachable by URL, which is
  // exactly how the Big Board works. A non-member typing #board still
  // gets nothing.
  //
  // Re-runs when permissions resolve, which is what gives a deep link its
  // second chance. Re-running is harmless the rest of the time: the writer
  // keeps the hash equal to the current tab, so applying it again is a no-op.
  useEffect(() => {
    const open = () => {
      const i = tabForSlug(TABS, window.location.hash)
      if (i >= 0 && canSeeRef.current(TABS[i])) {
        pendingSlug.current = null
        syncedSlug.current = TABS[i].slug  // the URL already says this — don't echo it back
        // Only a genuine change is "in flight". The writer sets the hash
        // itself, which fires hashchange right back at us — marking that
        // echo as a request would leave a marker nothing ever clears, and
        // the writer would stop updating the URL from then on.
        if (i !== activeTabRef.current) {
          requestedTab.current = i
          setTab(i)
        }
        return
      }
      // Unknown slug, or one this member may never see. Once the league
      // data is in, permissions are settled and the answer is final —
      // release the writer so it can correct the URL.
      if (i < 0 || isInitialLoadComplete) pendingSlug.current = null
    }
    open()
    window.addEventListener('hashchange', open)
    return () => window.removeEventListener('hashchange', open)
  }, [setTab, isAdmin, isPodMember, areaEnabled, isInitialLoadComplete])

  // Write: the address bar follows the tab, so every screen is shareable.
  // A typo'd or forbidden slug falls through to here and gets corrected,
  // rather than sitting in the URL looking like it worked.
  useEffect(() => {
    activeTabRef.current = activeTab
    if (pendingSlug.current) return          // an arriving link still has the floor
    // Wait for activeTab to catch up to what the reader asked for, or
    // we'd judge the URL against the tab we're navigating away from.
    if (requestedTab.current !== null) {
      if (requestedTab.current !== activeTab) return
      requestedTab.current = null
    }
    const slug = slugForTab(TABS, activeTab)
    if (!slug || syncedSlug.current === slug) { stamped.current = true; return }
    syncedSlug.current = slug
    if (stamped.current) {
      window.location.hash = slug            // a real navigation — keep it in history
    } else {
      // First sync of the session. On a cold load with no hash we'd
      // otherwise stamp #dashboard as a history entry, and the user's
      // first Back press would land on the page they're already on
      // instead of leaving the app.
      window.history.replaceState(null, '', `#${slug}`)
      stamped.current = true
    }
  }, [activeTab, isInitialLoadComplete])

  // Each tab gets its own boundary: a crash in one leaves the others
  // usable and the nav intact, and "Try again" re-mounts only that tab.
  const screens = (
    <ErrorBoundary label={labelOf(TABS[activeTab]) ?? 'This tab'} key={activeTab}>
      <Suspense fallback={<LoadingList count={5} />}>
        {activeTab === 0 && <DashboardView setTab={setTab} />}
        {activeTab === 1 && <RostersView setTab={setTab} />}
        {activeTab === 2 && <PlayersView setTab={setTab} />}
        {activeTab === 3 && <MarketView setTab={setTab} />}
        {activeTab === 4 && <BuilderView />}
        {activeTab === 5 && <PodView />}
        {activeTab === 6 && <BigBoardView />}
      </Suspense>
    </ErrorBoundary>
  )

  if (isDesktop) {
    return (
      <div className="desktop-shell">
        <Sidebar
          tabs={visibleTabs}
          tab={visibleTabs.indexOf(TABS[activeTab])}
          setTab={(i) => setTab(TABS.indexOf(visibleTabs[i]))}
          matchCount={incomingTradeCount}
          labelFor={labelOf}
        />
        <main className="desktop-main" key={activeTab}>
          <div className="desktop-content">{screens}</div>
        </main>
      </div>
    )
  }

  return (
    <div className="app-frame">
      <div className="screen-body" key={activeTab}>
        {screens}
      </div>

      <nav className={`tab-bar${visibleTabs.length >= 5 ? ' tab-bar-5' : ''}`}>
        {visibleTabs.map((t) => {
          const i = TABS.indexOf(t)
          return (
            <button key={t.label} className={i === activeTab ? 'active' : ''} onClick={() => setTab(i)}>
              <span className="tab-glyph">{t.glyph}</span>
              {shortOf(t)}
              {t.area === 'market' && incomingTradeCount > 0 && (
                <span className="tab-badge">{incomingTradeCount}</span>
              )}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
