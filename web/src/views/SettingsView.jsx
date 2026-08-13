// SettingsView — stub; full port of Views/SettingsView.swift lands in Phase 5.
import { DetailOverlay } from '../components/shared'
import { signOut } from '../services/authService'

export default function SettingsView({ onClose }) {
  return (
    <DetailOverlay title="Settings" onBack={onClose}>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="empty-state" style={{ padding: '40px 24px' }}>
          <div className="glyph">⚙️</div>
          <div className="title">Settings</div>
          <div>Profile, appearance &amp; league preferences arrive in Phase 5.</div>
        </div>
        <button
          className="iff-card"
          onClick={() => signOut()}
          style={{ padding: 14, color: '#EF4444', fontSize: 16, fontWeight: 600, textAlign: 'center' }}
        >
          Sign Out
        </button>
      </div>
    </DetailOverlay>
  )
}
