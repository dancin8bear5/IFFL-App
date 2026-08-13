// TabLayout — mirrors IFFLContentView's TabView. Admin tab appears only for isAdmin.
import { useApp } from '../context/AppContext'
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
  const { isAdmin } = useApp()
  const tabs = isAdmin ? [...TABS, { label: 'Admin', glyph: '🔧' }] : TABS
  const matchCount = 0 // wired to marketEngine in Phase 2

  return (
    <div className="app-frame">
      <div className="screen-body" key={tab}>
        {tab === 0 && <DashboardView setTab={setTab} />}
        {tab === 1 && <RostersView />}
        {tab === 2 && <MarketView />}
        {tab === 3 && <LeagueView />}
        {tab === 4 && isAdmin && <AdminView />}
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
