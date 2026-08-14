// TabLayout — app shell.
// Mobile (<900px): bottom tab bar. Desktop (≥900px): left sidebar.
// Six tabs; Admin lives inside Settings (commissioner only), and the old
// League tab was absorbed — standings sit on the Dashboard, history opens
// from the Dashboard tiles, and Rules is its own tab.
import { useApp } from '../context/AppContext'
import { useIsDesktop } from '../hooks/useBreakpoint'
import Sidebar from '../components/Sidebar'
import DashboardView from './DashboardView'
import RostersView from './RostersView'
import PlayersView from './PlayersView'
import MarketView from './MarketView'
import BuilderView from './BuilderView'

const TABS = [
  { label: 'Dashboard', glyph: '▦' },
  { label: 'Rosters',   glyph: '👥' },
  { label: 'Players',   glyph: '🔎' },
  { label: 'Market',    glyph: '⇄' },
  { label: 'Builder',   glyph: '🧪' },
]

export default function TabLayout({ tab, setTab }) {
  const { incomingTradeCount } = useApp()
  const isDesktop = useIsDesktop()

  const screens = (
    <>
      {tab === 0 && <DashboardView setTab={setTab} />}
      {tab === 1 && <RostersView setTab={setTab} />}
      {tab === 2 && <PlayersView setTab={setTab} />}
      {tab === 3 && <MarketView setTab={setTab} />}
      {tab === 4 && <BuilderView />}
    </>
  )

  if (isDesktop) {
    return (
      <div className="desktop-shell">
        <Sidebar tabs={TABS} tab={tab} setTab={setTab} matchCount={incomingTradeCount} />
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

      <nav className="tab-bar tab-bar-5">
        {TABS.map((t, i) => (
          <button key={t.label} className={i === tab ? 'active' : ''} onClick={() => setTab(i)}>
            <span className="tab-glyph">{t.glyph}</span>
            {t.label}
            {t.label === 'Market' && incomingTradeCount > 0 && (
              <span className="tab-badge">{incomingTradeCount}</span>
            )}
          </button>
        ))}
      </nav>
    </div>
  )
}
