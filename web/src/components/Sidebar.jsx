// Sidebar — desktop navigation shell (≥900px). Same tabs, same active-red
// treatment as the mobile tab bar; team chip + settings pinned at the bottom.
// Collapsible to a glyph-only rail two ways: manually (button, sticky via
// localStorage) and automatically at narrow desktop widths (CSS), so the
// nav gives up its width before the main content ever has to.
import { useState } from 'react'
import { useApp } from '../context/AppContext'
import { teamByName } from '../data/staticData'
import { BeltRow, TeamAvatar } from './shared'
import SettingsView from '../views/SettingsView'

export default function Sidebar({ tabs, tab, setTab, matchCount, labelFor = (t) => t.label }) {
  const { userTeam } = useApp()
  const [showSettings, setShowSettings] = useState(false)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebarCollapsed') === '1')
  const belts = teamByName[userTeam]?.beltWins ?? 0

  function toggleCollapsed() {
    setCollapsed((v) => {
      localStorage.setItem('sidebarCollapsed', v ? '0' : '1')
      return !v
    })
  }

  return (
    <nav className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      <div className="sidebar-logo">
        <div className="sidebar-logo-full">
          <div className="sidebar-logo-mark">Insanity League</div>
          <div className="sidebar-logo-sub">EST. 2008</div>
        </div>
        <div className="sidebar-logo-min sidebar-logo-mark" style={{ fontSize: 19 }}>IL</div>
      </div>

      <div className="sidebar-nav">
        {tabs.map((t, i) => (
          <button
            key={t.label}
            className={`sidebar-item ${i === tab ? 'active' : ''}`}
            onClick={() => setTab(i)}
            title={labelFor(t)}
            aria-label={labelFor(t)}
            // The flyout label the rail shows on hover. Read by CSS from
            // here because the .sidebar-label text node is hidden when
            // collapsed, so there's nothing left to read it from.
            data-label={labelFor(t)}
          >
            <span className="sidebar-glyph">{t.glyph}</span>
            <span className="sidebar-label">{labelFor(t)}</span>
            {t.area === 'market' && matchCount > 0 && (
              <span className="sidebar-badge">{matchCount}</span>
            )}
          </button>
        ))}
      </div>

      <button
        className="sidebar-collapse-btn"
        onClick={toggleCollapsed}
        aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        title={collapsed ? 'Expand' : 'Collapse'}
      >
        {collapsed ? '»' : '« Collapse'}
      </button>

      <div className="sidebar-foot">
        <button
          className="sidebar-team"
          onClick={() => setShowSettings(true)}
          title="Settings"
          aria-label="Settings"
          data-label={userTeam ? `${userTeam} · Settings` : 'Settings'}
        >
          <TeamAvatar name={userTeam || '?'} size={32} />
          <span className="sidebar-team-detail" style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
            <span style={{ display: 'block', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {userTeam || 'No team'}
            </span>
            <BeltRow count={belts} size={8} />
          </span>
          <span className="sidebar-team-detail" style={{ fontSize: 24, color: 'var(--iff-text)' }}>⚙</span>
        </button>
      </div>

      {showSettings && <SettingsView onClose={() => setShowSettings(false)} />}
    </nav>
  )
}
