// ParlayView — the Weekly Low Points Parlay.
// The week's lowest scorer pays $10 into the pot; every team picks ONE of
// their own players (starters or bench) to score a TD. Entries lock 30
// minutes before Sunday's first kickoff — the commissioner sets the lock
// time when opening the week. Payout splits among teams that submitted.
import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { fantasyTeams } from '../data/staticData'
import { DetailOverlay, TeamAvatar } from './shared'
import * as fs from '../services/firestoreService'

const fmtLock = (d) =>
  d
    ? d.toLocaleString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '—'

function useCountdown(target) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])
  if (!target) return { locked: false, label: null }
  const ms = target - now
  if (ms <= 0) return { locked: true, label: 'Locked' }
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return { locked: false, label: h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : h > 0 ? `${h}h ${m}m` : `${m}m` }
}

export default function ParlayView({ onClose }) {
  const {
    parlayConfig, parlayEntries, submitParlayPick,
    allDisplayAssets, userTeam, isAdmin, activeSeason,
  } = useApp()
  const [saving, setSaving] = useState(false)
  const [pick, setPick] = useState('')

  const { locked, label } = useCountdown(parlayConfig?.lockAt ?? null)
  const open = Boolean(parlayConfig?.open) && !locked

  // My roster, players only, ALPHABETICAL — the whole ask
  const myPlayers = useMemo(
    () =>
      allDisplayAssets
        .filter((a) => a.teamName === userTeam && !a.isPick)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [allDisplayAssets, userTeam],
  )

  const myEntry = parlayEntries.find((e) => e.teamName === userTeam)
  const entered = new Set(parlayEntries.map((e) => e.teamName))
  const missing = fantasyTeams.filter((t) => !entered.has(t.name))

  async function submit() {
    const asset = myPlayers.find((a) => a.id === pick)
    if (!asset) return
    setSaving(true)
    try {
      await submitParlayPick(asset)
      setPick('')
    } catch (e) {
      alert(`Failed: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <DetailOverlay title="Low Points Parlay" onBack={onClose} desktop="wide">
      <div style={{ padding: '12px 14px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Week status */}
        <div
          className="iff-card"
          style={{
            padding: 14, display: 'flex', alignItems: 'center', gap: 12,
            border: open ? '1.5px solid rgba(74,222,128,0.5)' : '1px solid transparent',
          }}
        >
          <span style={{ fontSize: 22 }}>{open ? '🎯' : '🔒'}</span>
          <span style={{ flex: 1 }}>
            <span style={{ display: 'block', fontSize: 14, fontWeight: 800 }}>
              {parlayConfig?.week ? `Week ${parlayConfig.week}` : 'No week open'}
              {parlayConfig?.season ? ` · ${parlayConfig.season}` : ''}
            </span>
            <span style={{ display: 'block', fontSize: 11, color: 'var(--iff-subtext)', marginTop: 2 }}>
              {parlayConfig?.open
                ? locked
                  ? `Locked ${fmtLock(parlayConfig?.lockAt)}`
                  : `Locks ${fmtLock(parlayConfig?.lockAt)} — pick a player on your roster to score a TD`
                : 'The commissioner opens entries each week during the season.'}
            </span>
          </span>
          {parlayConfig?.open && label && (
            <span
              className="tnum"
              style={{
                fontSize: 12, fontWeight: 800, padding: '4px 10px', borderRadius: 8,
                color: locked ? '#EF4444' : 'var(--iff-green)',
                background: locked ? 'rgba(239,68,68,0.15)' : 'rgba(74,222,128,0.12)',
              }}
            >
              {locked ? '🔒 Locked' : `⏱ ${label}`}
            </span>
          )}
        </div>

        {/* My pick */}
        {parlayConfig?.open && userTeam && (
          <div className="iff-card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--iff-subtext)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Your TD Pick — {userTeam}
            </div>
            {myEntry && (
              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--iff-green)' }}>
                ✓ {myEntry.playerName}
                <span style={{ fontSize: 10.5, fontWeight: 400, color: 'var(--iff-subtext)' }}>
                  {' '}— submitted{locked ? '' : ', changeable until lock'}
                </span>
              </div>
            )}
            {!locked && (
              <>
                <select value={pick} onChange={(e) => setPick(e.target.value)}>
                  <option value="">
                    {myEntry ? 'Change pick…' : 'Pick a player to score a TD…'}
                  </option>
                  {myPlayers.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.position})
                    </option>
                  ))}
                </select>
                <div style={{ fontSize: 10, color: 'var(--iff-subtext)', lineHeight: 1.5 }}>
                  Starters and bench both count. Only players in Sunday-noon-or-later and Monday
                  games are eligible — early-window and Thursday players won't cash.
                </div>
                <button className="btn-primary" disabled={!pick || saving} onClick={submit} style={{ fontSize: 13 }}>
                  {saving ? 'Submitting…' : myEntry ? 'Change Pick' : 'Submit Pick'}
                </button>
              </>
            )}
          </div>
        )}

        {/* The board */}
        {parlayConfig?.open && (
          <div className="iff-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '11px 14px', fontSize: 13, fontWeight: 800, borderBottom: '1px solid var(--iff-divider)' }}>
              The Board — {parlayEntries.length}/12 in
            </div>
            {fantasyTeams.map((t, i) => {
              const entry = parlayEntries.find((e) => e.teamName === t.name)
              const isLow = parlayConfig?.lowScorer === t.name
              return (
                <div key={t.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderTop: i ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                  <TeamAvatar name={t.name} size={26} />
                  <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700 }}>
                    {t.name}
                    {isLow && (
                      <span style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--iff-gold)', background: 'rgba(244,162,97,0.15)', padding: '2px 7px', borderRadius: 5, marginLeft: 7 }}>
                        💸 $10 CONTRIBUTOR
                      </span>
                    )}
                  </span>
                  {entry ? (
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--iff-green)' }}>
                      {locked ? entry.playerName : '✓ in'}
                    </span>
                  ) : (
                    <span style={{ fontSize: 11, color: 'var(--iff-subtext)' }}>—</span>
                  )}
                </div>
              )
            })}
            {!locked && parlayEntries.length > 0 && (
              <div style={{ padding: '9px 14px', fontSize: 10, color: 'var(--iff-subtext)', borderTop: '1px solid var(--iff-divider)' }}>
                Picks are hidden until lock{missing.length > 0 ? ` · waiting on ${missing.map((t) => t.name).join(', ')}` : ''}
              </div>
            )}
          </div>
        )}

        {/* Commissioner controls */}
        {isAdmin && <ParlayAdmin activeSeason={activeSeason} parlayConfig={parlayConfig} />}
      </div>
    </DetailOverlay>
  )
}

/** Commissioner: open/lock the week, mark the $10 low scorer, record the result. */
function ParlayAdmin({ activeSeason, parlayConfig }) {
  const [week, setWeek] = useState(String(parlayConfig?.week ?? 1))
  const [lockAt, setLockAt] = useState('')
  const [lowScorer, setLowScorer] = useState(parlayConfig?.lowScorer ?? '')
  const [busy, setBusy] = useState(false)

  async function run(fn) {
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      alert(`Failed: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="iff-card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10, borderLeft: '3px solid var(--iff-accent)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--iff-subtext)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Commissioner
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12 }}>Week</span>
        <input type="number" min="1" max="14" value={week} onChange={(e) => setWeek(e.target.value)} className="tnum" style={{ width: 60, textAlign: 'center' }} />
        <span style={{ fontSize: 12 }}>locks</span>
        <input type="datetime-local" value={lockAt} onChange={(e) => setLockAt(e.target.value)} style={{ width: 'auto', fontSize: 12 }} />
        <button
          className="btn-outline"
          disabled={busy || !lockAt}
          onClick={() =>
            run(() =>
              fs.setParlayConfig({
                season: activeSeason,
                week: Number(week),
                lockAt: new Date(lockAt),
                open: true,
                lowScorer: lowScorer || null,
              }),
            )
          }
          style={{ fontSize: 11, padding: '6px 12px' }}
        >
          Open Week
        </button>
        {parlayConfig?.open && (
          <button
            className="btn-outline"
            disabled={busy}
            onClick={() => run(() => fs.setParlayConfig({ open: false }))}
            style={{ fontSize: 11, padding: '6px 12px', borderColor: '#EF4444', color: '#EF4444' }}
          >
            Close Week
          </button>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12 }}>$10 low scorer</span>
        <select value={lowScorer} onChange={(e) => setLowScorer(e.target.value)} style={{ width: 'auto', minWidth: 120, fontSize: 12 }}>
          <option value="">—</option>
          {fantasyTeams.map((t) => (
            <option key={t.name} value={t.name}>{t.name}</option>
          ))}
        </select>
        <button
          className="btn-outline"
          disabled={busy || !lowScorer}
          onClick={() => run(() => fs.setParlayConfig({ lowScorer }))}
          style={{ fontSize: 11, padding: '6px 12px' }}
        >
          Save
        </button>
      </div>
      <div style={{ fontSize: 10, color: 'var(--iff-subtext)', lineHeight: 1.5 }}>
        Set the lock 30 minutes before Sunday's first kickoff. Payout splits among teams that
        submitted; early cashout needs unanimous consent of participants.
      </div>
    </div>
  )
}
