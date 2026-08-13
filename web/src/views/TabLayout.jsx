// TabLayout — mirrors IFFLContentView's TabView.
// Mobile (<900px): bottom tab bar, single-column frame (unchanged).
// Desktop (≥900px): left sidebar + wide content area.
import { useApp } from '../context/AppContext'
import { useIsDesktop } from '../hooks/useBreakpoint'
import Sidebar from '../components/Sidebar'
import DashboardView from './DashboardView'
import RostersView from './RostersView'
import MarketView from './MarketView'
import LeagueView from './LeagueView'
import AdminView from './AdminView'

const TABS = [
  { label: 'Dashboard', glyph: '▦' },
  { label: 'Rosters',   glyph: '👥' },
  { label: 'Market',    glyph: '⇄' },
  { label: 'League',    glyph: '🏟' },
]

export default function TabLayout({ tab, setTab }) {
  const { isAdmin, incomingTradeCount } = useApp()
  const isDesktop = useIsDesktop()
  const tabs = isAdmin ? [...TABS, { label: 'Admin', glyph: '🔧' }] : TABS
  // Badge = trade offers awaiting YOUR response (ESPN-style action signal)
  const matchCount = incomingTradeCount

  const screens = (
    <>
      {tab === 0 && <DashboardView setTab={setTab} />}
      {tab === 1 && <RostersView setTab={setTab} />}
      {tab === 2 && <MarketView setTab={setTab} />}
      {tab === 3 && <LeagueView />}
      {tab === 4 && isAdmin && <AdminView />}
    </>
  )

  if (isDesktop) {
    return (
      <div className="desktop-shell">
        <Sidebar tabs={tabs} tab={tab} setTab={setTab} matchCount={matchCount} />
        <main className="desktop-main" key={tab}>
          <div className="desktop-content">{screens}</div>
        </main>
      </div>
    )
  }

  return (
    <div className="app-frame">
      <div className="screen-body" key={tab}>
        {screens}
      </div>

      <nav className="tab-bar">
        {tabs.map((t, i) => (
          <button key={t.label} className={i === tab ? 'active' : ''} onClick={() => setTab(i)}>
            <span className="tab-glyph">{t.glyph}</span>
            {t.label}
            {t.label === 'Market' && matchCount > 0 && (
              <span className="tab-badge">{matchCount}</span>
            )}
          </button>
        ))}
      </nav>
    </div>
  )
}
