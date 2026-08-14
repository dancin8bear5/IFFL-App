// RulesTab — league rules + voting portal as a top-level tab.
import { useState } from 'react'
import { useApp } from '../context/AppContext'
import { useIsDesktop } from '../hooks/useBreakpoint'
import RulesView from '../components/RulesView'
import SettingsView from './SettingsView'

export default function RulesTab() {
  const isDesktop = useIsDesktop()
  const { rulesVotingOpen } = useApp()
  const [showSettings, setShowSettings] = useState(false)

  return (
    <div>
      {isDesktop ? (
        <div className="dash-hero-desktop">
          <h1>League Rules</h1>
          <span className="season-chip">{rulesVotingOpen ? '🗳️ voting open' : '🔒 voting closed'}</span>
        </div>
      ) : (
        <div className="nav-bar">
          <div className="nav-side" />
          <div className="nav-title">Rules</div>
          <div className="nav-side right">
            <button className="icon-btn" onClick={() => setShowSettings(true)} aria-label="Settings">⚙</button>
          </div>
        </div>
      )}
      <div style={{ paddingTop: 12 }}>
        <RulesView />
      </div>
      {showSettings && <SettingsView onClose={() => setShowSettings(false)} />}
    </div>
  )
}
