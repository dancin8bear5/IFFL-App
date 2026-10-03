// SettingsView — the full settings experience.
// Profile, appearance (era, accent, text size, confetti), league prefs,
// sign out.
//
// Appearance SAVES ON THE TAP; everything else waits for the Save button.
// The split is deliberate: a theme is a view preference you judge by looking
// at it, and gating it behind a button at the bottom of a long page meant
// leaving by ‹ Back — or by tapping outside the panel — showed the new look
// and then quietly threw it away.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../context/AppContext'
import { fantasyTeams, teamByName, FMK_ENABLED } from '../data/staticData'
import { DetailOverlay, TeamAvatar } from '../components/shared'
import { presetsForTeam, fileToAvatarDataUrl } from '../services/avatars'
import { signOut } from '../services/authService'
import * as fs from '../services/firestoreService'
import { applyAppearance, resolveAccent, resolveTheme, ACCENT_CHOICES, TEXT_SIZES, UI_THEMES, fireConfetti } from '../services/appearance'

const APP_VERSION = 'Insanity League Web 1.0'
const TAB_NAMES = ['Dashboard', 'Rosters', 'Market', 'League']

export default function SettingsView({ onClose }) {
  const {
    user, userTeam, setUserTeam, setSelectedTeam,
    userSettings, didLoadSettings, saveUserSettings, savePartialSettings, isAdmin,
  } = useApp()
  const [settings, setSettings] = useState(userSettings)
  const [team, setTeam] = useState(userTeam)
  const [saving, setSaving] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)
  const [error, setError] = useState(null)

  const set = (patch) => setSettings((s) => ({ ...s, ...patch }))

  // Re-seed from the stored settings the moment they arrive.
  //
  // This panel is reachable from the sidebar immediately, while
  // fetchUserSettings is still a round trip away — so useState's initial
  // value can be the DEFAULTS. Saving then wrote those defaults over the
  // real document, which is how a theme chosen earlier got erased by a
  // later, unrelated save. Only seeds once, so it can never stomp an edit
  // in progress.
  const seeded = useRef(didLoadSettings)
  useEffect(() => {
    if (!didLoadSettings || seeded.current) return
    seeded.current = true
    setSettings(userSettings)
  }, [didLoadSettings, userSettings])

  /**
   * Appearance saves ON CLICK — picking a theme IS the save.
   *
   * It used to preview live and persist only via the Save button at the
   * bottom of the page, so leaving by ‹ Back or by tapping outside the
   * panel threw the choice away after showing it working. A view preference
   * with a hidden second step is the whole complaint.
   */
  async function setAppearance(patch) {
    set(patch)
    setError(null)
    try {
      await savePartialSettings(patch)
    } catch {
      // savePartialSettings already put the stored value back; mirror that
      // locally so the panel agrees with what is actually saved.
      setSettings((s) => ({ ...s, ...Object.fromEntries(Object.keys(patch).map((k) => [k, userSettings[k]])) }))
      setError('Could not save that — check your connection and try again.')
    }
  }

  // Appearance follows the local copy so a pick shows instantly, and the
  // team selector is included because the "My Team" accent depends on it.
  useEffect(() => {
    applyAppearance(settings, team || userTeam)
  }, [settings.retroMode, settings.uiTheme, settings.accentColor, settings.textSize, team, userTeam])

  // On the way out, fall back to what is actually SAVED.
  //
  // A no-op for the appearance controls, which save on the tap — this is
  // here for the ESPN Team dropdown, which does not. Picking a team moves
  // the "My Team" accent live, and that choice is commissioner-gated, so
  // leaving without a successful save would otherwise strand (and cache)
  // an accent belonging to a team that was never assigned.
  //
  // A ref, and an unmount-only effect: the previous version listed
  // `userSettings` as a dependency, so every save re-ran its cleanup with
  // the PRE-save values and briefly re-applied the look the user had just
  // replaced.
  const savedRef = useRef(null)
  savedRef.current = { settings: userSettings, team: userTeam }
  useEffect(() => () => {
    applyAppearance(savedRef.current.settings, savedRef.current.team)
  }, [])

  async function save() {
    setSaving(true)
    setError(null)
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
    } catch (err) {
      // Previously unhandled: the write failed, the panel stayed open with
      // no explanation, and local state still showed the change. Say so
      // rather than letting it read as saved.
      console.error('saveUserSettings failed:', err)
      setError('Could not save your settings — check your connection and try again.')
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

        <ProfilePictureSection />

        <Section title="Appearance — saves as you pick">
          {/* Era themes — each decade reskins the whole app */}
          <div style={{ padding: '11px 14px', borderBottom: '1px solid var(--iff-divider)' }}>
            <div style={{ fontSize: 12, color: 'var(--iff-subtext)', marginBottom: 10 }}>🕰️ Era</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
              {UI_THEMES.map((t) => {
                const active = resolveTheme(settings) === t.key
                return (
                  <button
                    key={t.key}
                    // retroMode kept in sync so pre-era saved settings stay valid
                    onClick={() => setAppearance({ uiTheme: t.key, retroMode: t.key === '90s' })}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3,
                      padding: '9px 11px', borderRadius: 10, textAlign: 'left',
                      background: active ? 'var(--iff-elevated)' : 'transparent',
                      outline: active ? '2px solid var(--iff-accent)' : '1px solid var(--iff-divider)',
                    }}
                  >
                    <span style={{ fontSize: 12.5, fontWeight: 800, color: active ? 'var(--iff-text)' : 'var(--iff-subtext)' }}>
                      {t.glyph} {t.label}
                    </span>
                    <span style={{ fontSize: 9.5, color: 'var(--iff-subtext)', lineHeight: 1.35 }}>{t.blurb}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Accent color (era themes own their palettes — Modern only) */}
          {resolveTheme(settings) === 'default' && (
            <div style={{ padding: '11px 14px', borderBottom: '1px solid var(--iff-divider)' }}>
              <div style={{ fontSize: 12, color: 'var(--iff-subtext)', marginBottom: 10 }}>🎨 Accent Color</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {ACCENT_CHOICES.map((c) => {
                  const swatch = c.key === 'team' ? (teamByName[team || userTeam]?.color ?? '#E63946') : c.color
                  const active = (settings.accentColor ?? 'red') === c.key
                  return (
                    <button
                      key={c.key}
                      onClick={() => setAppearance({ accentColor: c.key })}
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
                    onClick={() => setAppearance({ textSize: t.key })}
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
            {/* In the Appearance section, so it saves on the tap like the rest of it */}
            <MiniToggle on={settings.confetti ?? true} onChange={(v) => setAppearance({ confetti: v })} label="Victory Confetti" />
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
          {FMK_ENABLED && (
            <Toggle label="Share My FMK Ratings" on={settings.fmkPublic} onChange={(v) => set({ fmkPublic: v })} />
          )}
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

        {error && (
          <div
            data-testid="settings-error"
            style={{
              padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600,
              background: 'rgba(239, 68, 68, 0.12)', color: '#F87171',
              border: '1px solid rgba(239, 68, 68, 0.35)',
            }}
          >
            {error}
          </div>
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

/**
 * Profile picture — upload anything, or take one of the built-ins.
 * Whatever lands here shows up everywhere in the app at once, because all
 * ~30 avatar call sites render through TeamAvatar (see components/shared).
 */
function ProfilePictureSection() {
  const { userTeam, teamAvatars, saveMyAvatarImage, saveMyAvatarPreset, clearMyAvatar } = useApp()
  const fileRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const mine = teamAvatars?.[userTeam] ?? null
  const presets = useMemo(() => presetsForTeam(userTeam), [userTeam])
  const hasCustom = Boolean(mine?.dataUrl || mine?.presetId)

  async function onPick(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // let the same file be re-picked after a failure
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('Pick an image file.'); return }
    setBusy(true)
    setError(null)
    try {
      // Downscaled + compressed in the browser before it ever leaves the
      // device — see services/avatars.fileToAvatarDataUrl.
      const dataUrl = await fileToAvatarDataUrl(file)
      await saveMyAvatarImage(dataUrl)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function choose(presetId) {
    setBusy(true)
    setError(null)
    try {
      await saveMyAvatarPreset(presetId)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (!userTeam) return null

  return (
    <Section title="Profile picture">
      <div style={{ padding: '14px', display: 'flex', alignItems: 'center', gap: 14, borderBottom: '1px solid var(--iff-divider)' }}>
        <TeamAvatar name={userTeam} size={64} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{userTeam}</div>
          <div style={{ fontSize: 11, color: 'var(--iff-subtext)', lineHeight: 1.5, marginTop: 2 }}>
            Shows up everywhere your team appears — rosters, trades, rankings, the ledger.
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 9, flexWrap: 'wrap' }}>
            <button className="btn-primary" onClick={() => fileRef.current?.click()} disabled={busy} style={{ fontSize: 11.5, padding: '6px 14px' }}>
              {busy ? 'Working…' : 'Upload a picture'}
            </button>
            {hasCustom && (
              <button onClick={() => clearMyAvatar()} disabled={busy} style={{ fontSize: 11.5, padding: '6px 12px', color: 'var(--iff-subtext)' }}>
                Reset to team logo
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={onPick} style={{ display: 'none' }} />
        </div>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', fontSize: 11.5, color: 'var(--iff-accent)', borderBottom: '1px solid var(--iff-divider)' }}>
          {error}
        </div>
      )}

      <div style={{ padding: '12px 14px' }}>
        <div style={{ fontSize: 12, color: 'var(--iff-subtext)', marginBottom: 9 }}>
          …or grab one of these — the first few are yours
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(52px, 1fr))', gap: 8 }}>
          {presets.map((p) => {
            const active = mine?.presetId === p.id && !mine?.dataUrl
            return (
              <button
                key={p.id}
                onClick={() => choose(p.id)}
                disabled={busy}
                title={p.label}
                aria-label={p.label}
                aria-pressed={active}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  padding: '7px 2px', borderRadius: 10,
                  background: active ? 'var(--iff-elevated)' : 'transparent',
                  outline: active ? '2px solid var(--iff-accent)' : '1px solid var(--iff-divider)',
                }}
              >
                <span
                  style={{
                    width: 34, height: 34, borderRadius: '22%', background: p.bg,
                    fontSize: 20, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {p.emoji}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </Section>
  )
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
