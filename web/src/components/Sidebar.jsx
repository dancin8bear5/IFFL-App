// Sidebar — desktop navigation shell (≥900px). Same tabs, same active-red
// treatment as the mobile tab bar; team chip + settings pinned at the bottom.
import { useState } from 'react'
import { useApp } from '../context/AppContext'
import { teamByName } from '../data/staticData'
import { BeltRow, TeamAvatar } from './shared'
import SettingsView from '../views/SettingsView'

export default function Sidebar({ tabs, tab, setTab, matchCount }) {
  const { userTeam } = useApp()
  const [showSettings, setShowSettings] = useState(false)
  const belts = teamByName[userTeam]?.beltWins ?? 0

  return (
    <nav className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-mark">Insanity League</div>
        <div className="sidebar-logo-sub">EST. 2008</div>
      </div>

      <div className="sidebar-nav">
        {tabs.map((t, i) => (
          <button
            key={t.label}
            className={`sidebar-item ${i === tab ? 'active' : ''}`}
            onClick={() => setTab(i)}
          >
            <span className="sidebar-glyph">{t.glyph}</span>
            <span>{t.label}</span>
            {t.label === 'Market' && matchCount > 0 && (
              <span className="sidebar-badge">{matchCount}</span>
            )}
          </button>
        ))}
      </div>

      <div className="sidebar-foot">
        <button className="sidebar-team" onClick={() => setShowSettings(true)}>
          <TeamAvatar name={userTeam || '?'} size={32} />
          <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
            <span style={{ display: 'block', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {userTeam || 'No team'}
            </span>
            <BeltRow count={belts} size={8} />
          </span>
          <span style={{ fontSize: 15, color: 'var(--iff-subtext)' }}>⚙</span>
        </button>
      </div>

      {showSettings && <SettingsView onClose={() => setShowSettings(false)} />}
    </nav>
  )
}
