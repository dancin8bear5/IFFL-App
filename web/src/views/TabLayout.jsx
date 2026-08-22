// TabLayout — app shell.
// Mobile (<900px): bottom tab bar. Desktop (≥900px): left sidebar.
// Six tabs; Admin lives inside Settings (commissioner only), and the old
// League tab was absorbed — standings sit on the Dashboard, history opens
// from the Dashboard tiles, and Rules is its own tab.
// The commissioner can switch any tab off league-wide (Admin > Areas);
// Dashboard is always on, and the admin account always sees everything.
import { lazy, Suspense } from 'react'
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

// `label` shows in the desktop sidebar; `short` fits the mobile tab bar.
// `podOnly` marks a tab only the three POD hosts can see.
const TABS = [
  { label: 'Dashboard',        short: 'Dashboard', glyph: '▦' },  // always on
  { label: 'Rosters',          short: 'Rosters',   glyph: '👥', area: 'rosters' },
  { label: 'Players',          short: 'Players',   glyph: '🔎', area: 'players' },
  { label: 'F.M.K. Market',    short: 'F.M.K.',    glyph: '⇄',  area: 'market' },
  { label: 'myTeam Worksheet', short: 'Worksheet', glyph: '🧪', area: 'builder' },
  { label: 'The POD',          short: 'POD',       glyph: '🎙️', podOnly: true },
]

export default function TabLayout({ tab, setTab }) {
  const { incomingTradeCount, areaEnabled, isPodMember } = useApp()
  const isDesktop = useIsDesktop()

  // Indices stay stable (setTab(3) is always Market); hidden tabs just
  // vanish from the nav, and landing on one falls back to the Dashboard.
  const canSee = (t) => (t.podOnly ? isPodMember : !t.area || areaEnabled(t.area))
  const visibleTabs = TABS.filter(canSee)
  const activeTab = TABS[tab] && !canSee(TABS[tab]) ? 0 : tab

  // Each tab gets its own boundary: a crash in one leaves the others
  // usable and the nav intact, and "Try again" re-mounts only that tab.
  const screens = (
    <ErrorBoundary label={TABS[activeTab]?.label ?? 'This tab'} key={activeTab}>
      <Suspense fallback={<LoadingList count={5} />}>
        {activeTab === 0 && <DashboardView setTab={setTab} />}
        {activeTab === 1 && <RostersView setTab={setTab} />}
        {activeTab === 2 && <PlayersView setTab={setTab} />}
        {activeTab === 3 && <MarketView setTab={setTab} />}
        {activeTab === 4 && <BuilderView />}
        {activeTab === 5 && <PodView />}
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
              {t.short}
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
