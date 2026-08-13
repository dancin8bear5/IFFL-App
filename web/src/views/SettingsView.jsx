// SettingsView — port of Views/SettingsView.swift.
// Profile, appearance, league prefs, sign out, version footer.
import { useState } from 'react'
import { useApp } from '../context/AppContext'
import { fantasyTeams, logoPresets } from '../data/staticData'
import { DetailOverlay } from '../components/shared'
import { signOut } from '../services/authService'
import * as fs from '../services/firestoreService'

const APP_VERSION = 'Insanity League Web 1.0'
const TAB_NAMES = ['Dashboard', 'Rosters', 'Market', 'League']

export default function SettingsView({ onClose }) {
  const { user, userTeam, setUserTeam, setSelectedTeam, userSettings, saveUserSettings } = useApp()
  const [settings, setSettings] = useState(userSettings)
  const [team, setTeam] = useState(userTeam)
  const [saving, setSaving] = useState(false)

  const set = (patch) => setSettings((s) => ({ ...s, ...patch }))

  async function save() {
    setSaving(true)
    try {
      await saveUserSettings(settings)
      if (team && team !== userTeam) {
        if (user) await fs.assignTeam(user.uid, team).catch(() => {})
        setUserTeam(team)
        setSelectedTeam(team)
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <DetailOverlay title="Settings" onBack={onClose}>
      <div style={{ padding: '4px 16px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>

        <Section title="Profile">
          <Row label="Name" value={user?.displayName ?? '—'} />
          <Row label="Email" value={user?.email ?? '—'} small />
          <div style={rowStyle}>
            <span>ESPN Team</span>
            <select value={team} onChange={(e) => setTeam(e.target.value)} style={{ width: 'auto', minWidth: 130 }}>
              {fantasyTeams.map((t) => (
                <option key={t.name} value={t.name}>{t.name}</option>
              ))}
            </select>
          </div>
          <div style={rowStyle}>
            <span>Nickname</span>
            <input
              type="text"
              placeholder="Optional"
              value={settings.displayNickname ?? ''}
              onChange={(e) => set({ displayNickname: e.target.value || null })}
              style={{ width: 150, textAlign: 'right' }}
            />
          </div>
        </Section>

        <Section title="Appearance">
          <div style={{ padding: '10px 14px' }}>
            <div style={{ fontSize: 11, color: 'var(--iff-subtext)', marginBottom: 8 }}>Team Logo Icon</div>
            <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
              {logoPresets.map((glyph) => {
                const active = settings.teamLogoName === glyph
                return (
                  <button
                    key={glyph}
                    onClick={() => set({ teamLogoName: active ? null : glyph })}
                    style={{
                      width: 44, height: 44, borderRadius: '50%', fontSize: 20, flexShrink: 0,
                      background: active ? 'rgba(230,57,70,0.2)' : 'var(--iff-elevated)',
                      outline: active ? '2px solid var(--iff-accent)' : 'none',
                    }}
                  >
                    {glyph}
                  </button>
                )
              })}
            </div>
          </div>
          <Toggle
            label="📼 90s Mode"
            on={settings.retroMode ?? false}
            onChange={(v) => set({ retroMode: v })}
          />
          <Row label="Theme" value={settings.retroMode ? 'Totally Radical' : 'Dark'} />
        </Section>

        <Section title="League">
          <div style={rowStyle}>
            <span>Default Tab</span>
            <select
              value={settings.defaultTab}
              onChange={(e) => set({ defaultTab: Number(e.target.value) })}
              style={{ width: 'auto', minWidth: 130 }}
            >
              {TAB_NAMES.map((name, i) => (
                <option key={name} value={i}>{name}</option>
              ))}
            </select>
          </div>
          <Toggle label="Show Trade Values" on={settings.showTradeValues} onChange={(v) => set({ showTradeValues: v })} />
          <Toggle label="Share My FMK Ratings" on={settings.fmkPublic} onChange={(v) => set({ fmkPublic: v })} />
        </Section>

        <Section title="Notifications">
          <Row label="🔔 Push notifications" value="coming soon" small />
        </Section>

        <button className="btn-primary" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>

        <div className="iff-card">
          <button
            onClick={() => signOut()}
            style={{ width: '100%', padding: 14, color: '#EF4444', fontSize: 16, fontWeight: 600, textAlign: 'center' }}
          >
            Sign Out
          </button>
        </div>

        <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--iff-subtext)', opacity: 0.6 }}>
          {APP_VERSION}
        </div>
      </div>
    </DetailOverlay>
  )
}

const rowStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '11px 14px',
  fontSize: 15,
  borderBottom: '1px solid var(--iff-divider)',
}

function Section({ title, children }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--iff-subtext)', textTransform: 'uppercase', letterSpacing: 0.6, padding: '0 4px 6px' }}>
        {title}
      </div>
      <div className="iff-card" style={{ overflow: 'hidden' }}>{children}</div>
    </div>
  )
}

function Row({ label, value, small }) {
  return (
    <div style={rowStyle}>
      <span style={{ color: 'var(--iff-subtext)' }}>{label}</span>
      <span style={{ color: 'var(--iff-subtext)', fontSize: small ? 12 : 14, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

function Toggle({ label, on, onChange }) {
  return (
    <div style={rowStyle}>
      <span>{label}</span>
      <button
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => onChange(!on)}
        style={{
          width: 44, height: 26, borderRadius: 13, position: 'relative', flexShrink: 0,
          background: on ? '#22C55E' : 'var(--iff-elevated)',
          transition: 'background 0.15s',
        }}
      >
        <span
          style={{
            position: 'absolute', top: 2, left: on ? 20 : 2,
            width: 22, height: 22, borderRadius: '50%', background: '#fff',
            boxShadow: '0 1px 3px rgba(0,0,0,0.35)', transition: 'left 0.15s',
          }}
        />
      </button>
    </div>
  )
}
