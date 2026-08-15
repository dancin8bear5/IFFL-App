// BuilderView — Team Builder as a top-level tab.
import { useState } from 'react'
import { useIsDesktop } from '../hooks/useBreakpoint'
import KeeperBuilder from '../components/KeeperBuilder'
import SettingsView from './SettingsView'

export default function BuilderView() {
  const isDesktop = useIsDesktop()
  const [showSettings, setShowSettings] = useState(false)

  return (
    <div>
      {isDesktop ? (
        <div className="dash-hero-desktop">
          <h1>myTeam Worksheet</h1>
          <span className="season-chip">🔒 private keeper planning</span>
        </div>
      ) : (
        <div className="nav-bar">
          <div className="nav-side" />
          <div className="nav-title">myTeam Worksheet</div>
          <div className="nav-side right">
            <button className="icon-btn" onClick={() => setShowSettings(true)} aria-label="Settings">⚙</button>
          </div>
        </div>
      )}
      <KeeperBuilder />
      {showSettings && <SettingsView onClose={() => setShowSettings(false)} />}
    </div>
  )
}
