// SettingsView — the full settings experience.
// Profile, appearance (90s mode, accent, text size, confetti — all with
// LIVE preview while editing, restored on cancel), league prefs, sign out.
import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import { fantasyTeams, teamByName } from '../data/staticData'
import { DetailOverlay } from '../components/shared'
import { signOut } from '../services/authService'
import * as fs from '../services/firestoreService'
import { applyAppearance, resolveAccent, ACCENT_CHOICES, TEXT_SIZES, fireConfetti } from '../services/appearance'

const APP_VERSION = 'Insanity League Web 1.0'
const TAB_NAMES = ['Dashboard', 'Rosters', 'Market', 'League']

export default function SettingsView({ onClose }) {
  const { user, userTeam, setUserTeam, setSelectedTeam, userSettings, saveUserSettings, isAdmin } = useApp()
  const [settings, setSettings] = useState(userSettings)
  const [team, setTeam] = useState(userTeam)
  const [saving, setSaving] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)

  const set = (patch) => setSettings((s) => ({ ...s, ...patch }))

  // LIVE preview of appearance while editing; restore saved values on close
  useEffect(() => {
    applyAppearance(settings, team || userTeam)
  }, [settings.retroMode, settings.accentColor, settings.textSize, team, userTeam])
  useEffect(() => {
    return () => applyAppearance(userSettings, userTeam) // unmount → saved state
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userSettings, userTeam])

  async function save() {
    setSaving(true)
    try {
      await saveUserSettings(settings)
      if (team && team !== userTeam && user) {
        // Team assignment is commissioner-gated in Firestore rules. Only
        // flip local state if the write actually landed — otherwise the UI
        // would show a team change that silently never happened.
        try {
          await fs.assignTeam(user.uid, team)
          setUserTeam(team)
          setSelectedTeam(team)
        } catch {
          setTeam(userTeam)
          alert('Team changes are commissioner-only — ask Jared to reassign you.')
        }
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

        <Section title="Appearance — changes preview live">
          <Toggle
            label="📼 90s Mode"
            on={settings.retroMode ?? false}
            onChange={(v) => set({ retroMode: v })}
          />

          {/* Accent color (hidden in 90s mode — neon owns the palette) */}
          {!settings.retroMode && (
            <div style={{ padding: '11px 14px', borderBottom: '1px solid var(--iff-divider)' }}>
              <div style={{ fontSize: 12, color: 'var(--iff-subtext)', marginBottom: 10 }}>🎨 Accent Color</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {ACCENT_CHOICES.map((c) => {
                  const swatch = c.key === 'team' ? (teamByName[team || userTeam]?.color ?? '#E63946') : c.color
                  const active = (settings.accentColor ?? 'red') === c.key
                  return (
                    <button
                      key={c.key}
                      onClick={() => set({ accentColor: c.key })}
                      title={c.label}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '5px 10px 5px 6px', borderRadius: 18, fontSize: 11, fontWeight: 700,
                        background: active ? 'var(--iff-elevated)' : 'transparent',
                        outline: active ? `2px solid ${swatch}` : '1px solid var(--iff-divider)',
                        color: active ? 'var(--iff-text)' : 'var(--iff-subtext)',
                      }}
                    >
                      <span style={{ width: 18, height: 18, borderRadius: '50%', background: swatch, flexShrink: 0 }} />
                      {c.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Text size */}
          <div style={{ padding: '11px 14px', borderBottom: '1px solid var(--iff-divider)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 15 }}>🔠 Text Size</span>
            <div style={{ display: 'flex', gap: 4, background: 'var(--iff-elevated)', borderRadius: 9, padding: 3 }}>
              {TEXT_SIZES.map((t) => {
                const active = (settings.textSize ?? 'default') === t.key
                return (
                  <button
                    key={t.key}
                    onClick={() => set({ textSize: t.key })}
                    style={{
                      padding: '4px 12px', borderRadius: 7, fontWeight: 700,
                      fontSize: t.key === 'small' ? 11 : t.key === 'large' ? 15 : 13,
                      background: active ? 'var(--iff-accent)' : 'transparent',
                      color: active ? '#fff' : 'var(--iff-subtext)',
                    }}
                  >
                    {t.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Victory confetti */}
          <div style={{ padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 15, flex: 1 }}>🎉 Victory Confetti</span>
            <button
              onClick={() => fireConfetti()}
              style={{ fontSize: 10, fontWeight: 700, color: 'var(--iff-gold)', padding: '4px 10px', border: '1px solid var(--iff-divider)', borderRadius: 14 }}
            >
              try it
            </button>
            <MiniToggle on={settings.confetti ?? true} onChange={(v) => set({ confetti: v })} label="Victory Confetti" />
          </div>
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

        {/* Commissioner tools — only ever visible to the commissioner */}
        {isAdmin && (
          <Section title="Commissioner">
            <button
              onClick={() => setShowAdmin(true)}
              style={{ ...rowStyle, width: '100%', textAlign: 'left', borderBottom: 'none' }}
            >
              <span>🔧 Admin Panel</span>
              <span style={{ color: 'var(--iff-subtext)', fontSize: 13 }}>
                database · players · trades · teams · GroupMe ›
              </span>
            </button>
          </Section>
        )}

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

      {showAdmin && <AdminOverlay onClose={() => setShowAdmin(false)} />}
    </DetailOverlay>
  )
}

/** Admin panel opened from Settings — commissioner only. */
function AdminOverlay({ onClose }) {
  const [AdminView, setAdminView] = useState(null)
  useEffect(() => {
    import('./AdminView').then((m) => setAdminView(() => m.default))
  }, [])
  return (
    <DetailOverlay title="Admin" onBack={onClose} desktop="wide">
      {AdminView ? <AdminView /> : <div className="empty-state"><div>Loading admin…</div></div>}
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

function MiniToggle({ on, onChange, label }) {
  return (
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
  )
}
