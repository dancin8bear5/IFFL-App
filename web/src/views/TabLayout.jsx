// TabLayout — app shell.
// Mobile (<900px): bottom tab bar. Desktop (≥900px): left sidebar.
// Six tabs; Admin lives inside Settings (commissioner only), and the old
// League tab was absorbed — standings sit on the Dashboard, history opens
// from the Dashboard tiles, and Rules is its own tab.
// The commissioner can switch any tab off league-wide (Admin > Areas);
// Dashboard is always on, and the admin account always sees everything.
import { lazy, Suspense, useEffect } from 'react'
import { useApp } from '../context/AppContext'
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
const TABS = [
  { label: 'Dashboard',        short: 'Dashboard', glyph: '▦' },  // always on
  { label: 'Rosters',          short: 'Rosters',   glyph: '👥', area: 'rosters' },
  { label: 'Players',          short: 'Players',   glyph: '🔎', area: 'players' },
  { label: 'F.M.K. Market',    short: 'F.M.K.',    glyph: '⇄',  area: 'market', fmkLabel: true },
  { label: 'myTeam Worksheet', short: 'Worksheet', glyph: '🧪', area: 'builder' },
  { label: 'The POD',          short: 'POD',       glyph: '🎙️', podOnly: true },
  { label: 'Big Board',        short: 'Board',     glyph: '📋', adminOnly: true, urlOnly: '#board' },
]

export default function TabLayout({ tab, setTab }) {
  const { incomingTradeCount, areaEnabled, isPodMember, isAdmin, bigBoardInNav } = useApp()
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
  const fmkOn = areaEnabled('fmk')
  const labelOf = (t) => (t?.fmkLabel && !fmkOn ? 'Trades' : t?.label)
  const shortOf = (t) => (t?.fmkLabel && !fmkOn ? 'Trades' : t?.short)
  const visibleTabs = TABS.filter(inNav)
  const activeTab = TABS[tab] && !canSee(TABS[tab]) ? 0 : tab

  // Deep link. The app has no router, so the hash is read once on mount and
  // again on hashchange, and mapped to a tab index. Gated by canSee, not by
  // inNav — the whole point is that a hidden tab is still reachable — so a
  // non-admin typing #board still gets nothing.
  useEffect(() => {
    const open = () => {
      if (window.location.hash !== '#board') return
      const i = TABS.findIndex((t) => t.urlOnly === '#board')
      if (i >= 0 && canSee(TABS[i])) setTab(i)
    }
    open()
    window.addEventListener('hashchange', open)
    return () => window.removeEventListener('hashchange', open)
  })

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
