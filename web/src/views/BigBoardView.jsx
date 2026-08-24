// BigBoardView — the commissioner's keeper-planning board.
//
// Ported from a standalone Supabase-backed page that lived at /board.html.
// Two things were wrong with that version: it was world-writable (its anon
// key shipped in public HTML and the table's RLS policies allowed read,
// update AND insert to anyone who found the URL), and it sat outside the
// app entirely — no auth, no theming, no nav.
//
// Every draftable player sits in one of seven tiers and carries a Keep /
// Drop / Maybe call. The cap table totals each team's KEPT salary against
// the $200 auction budget — the number that actually matters pre-draft
// (distinct from the $300 post-draft roster ceiling; see staticData).
import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { useIsDesktop } from '../hooks/useBreakpoint'
import { fantasyTeams } from '../data/staticData'
import { ChipScroller, LoadingList } from '../components/shared'
import * as fs from '../services/firestoreService'
import SettingsView from './SettingsView'

// Best → worst. Order is the board's spine, so it's declared once here.
const TIERS = ['Superstars', 'Elite', 'Elite Cusp', 'Established Stars', 'Star Cusp', 'Potential Starters', 'Bench']
const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE']
const AUCTION_BUDGET = 200

const KDM = {
  K: { label: 'Keep',  color: '#22C55E' },
  M: { label: 'Maybe', color: 'var(--iff-gold)' },
  D: { label: 'Drop',  color: 'var(--iff-accent)' },
}
const POS_COLOR = { QB: '#D9A84E', RB: '#4FAE8B', WR: '#5F93D6', TE: '#C96B3C' }

export default function BigBoardView() {
  const { isAdmin } = useApp()
  const isDesktop = useIsDesktop()
  const [rows, setRows] = useState(null) // null = loading
  const [pos, setPos] = useState('ALL')
  const [team, setTeam] = useState('ALL')
  const [search, setSearch] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [savingId, setSavingId] = useState(null)
  const [status, setStatus] = useState(null) // 'saving' | 'saved' | null
  const [error, setError] = useState(null)

  useEffect(() => {
    try {
      return fs.listenToBigBoard(setRows)
    } catch (e) {
      setError(e.message)
      setRows([])
    }
  }, [])

  // Team abbreviations are what the board stores (TACO, MOON, …) — map back
  // to full names so the filter reads like the rest of the app.
  const abbrevToName = useMemo(
    () => Object.fromEntries(fantasyTeams.map((t) => [t.abbrev.toUpperCase(), t.name])),
    [],
  )

  const filtered = useMemo(() => {
    if (!rows) return []
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (pos !== 'ALL' && r.pos !== pos) return false
      if (team !== 'ALL' && String(r.team).toUpperCase() !== team) return false
      if (q && !String(r.player).toLowerCase().includes(q)) return false
      return true
    })
  }, [rows, pos, team, search])

  const byTier = useMemo(() => {
    const map = Object.fromEntries(TIERS.map((t) => [t, []]))
    for (const r of filtered) (map[r.tier] ?? (map[r.tier] = [])).push(r)
    for (const t of Object.keys(map)) map[t].sort((a, b) => (b.price ?? 0) - (a.price ?? 0))
    return map
  }, [filtered])

  // Budget math runs over ALL rows, never the filtered view — a team's
  // commitment doesn't change because you're looking at running backs.
  const capRows = useMemo(() => {
    if (!rows) return []
    const sums = Object.fromEntries(fantasyTeams.map((t) => [t.abbrev.toUpperCase(), { kept: 0, salary: 0 }]))
    for (const r of rows) {
      if (r.kdm !== 'K') continue
      const key = String(r.team).toUpperCase()
      if (!sums[key]) continue
      sums[key].kept += 1
      sums[key].salary += Number(r.price) || 0
    }
    return Object.entries(sums)
      .map(([abbrev, v]) => ({ abbrev, name: abbrevToName[abbrev] ?? abbrev, ...v, room: AUCTION_BUDGET - v.salary }))
      .sort((a, b) => b.salary - a.salary)
  }, [rows, abbrevToName])

  // Every edit writes straight to Firestore — there is no save button and
  // nothing to remember to press. The status chip makes that visible rather
  // than asking you to take it on faith.
  const capTotals = useMemo(
    () => capRows.reduce(
      (a, c) => ({ kept: a.kept + c.kept, salary: a.salary + c.salary, room: a.room + c.room }),
      { kept: 0, salary: 0, room: 0 },
    ),
    [capRows],
  )

  async function patch(row, fields) {
    setSavingId(row.id)
    setStatus('saving')
    setError(null)
    try {
      await fs.updateBigBoardPlayer(row.id, fields)
      setStatus('saved')
      // Clear after a beat — a permanent "Saved" label stops meaning anything.
      setTimeout(() => setStatus((cur) => (cur === 'saved' ? null : cur)), 1600)
    } catch (e) {
      setError(`Save failed: ${e.message}`)
      setStatus(null)
    } finally {
      setSavingId(null)
    }
  }

  const cycleKdm = (row) => patch(row, { kdm: row.kdm === 'K' ? 'M' : row.kdm === 'M' ? 'D' : 'K' })
  const moveTier = (row, dir) => {
    const i = TIERS.indexOf(row.tier)
    const next = TIERS[Math.min(TIERS.length - 1, Math.max(0, i + dir))]
    if (next && next !== row.tier) patch(row, { tier: next })
  }

  if (!isAdmin) {
    return (
      <div className="iff-card empty-state" style={{ margin: 16, padding: 32 }}>
        <div className="glyph">🔒</div>
        <div className="title">Commissioner only</div>
        <div>The Big Board holds private keeper calls on every team's roster.</div>
      </div>
    )
  }

  const filters = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <input
        type="search"
        placeholder="Search player…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label="Search the big board"
      />
      <ChipScroller>
        <div style={{ display: 'flex', gap: 6, width: 'max-content' }}>
          {POSITIONS.map((p) => (
            <button
              key={p}
              onClick={() => setPos(p)}
              style={{
                padding: '5px 13px', borderRadius: 18, fontSize: 11.5, fontWeight: 700,
                background: pos === p ? (POS_COLOR[p] ?? 'var(--iff-accent)') : 'var(--iff-elevated)',
                color: pos === p ? '#16190f' : 'var(--iff-subtext)',
              }}
            >
              {p}
            </button>
          ))}
        </div>
      </ChipScroller>
      <select value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Filter by team"
        style={{ width: 'auto', minWidth: 130, fontSize: 12, padding: '7px 9px' }}>
        <option value="ALL">All teams</option>
        {fantasyTeams.map((t) => (
          <option key={t.abbrev} value={t.abbrev.toUpperCase()}>{t.name}</option>
        ))}
      </select>
    </div>
  )

  const statusChip = (
    <span
      role="status"
      style={{
        fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap',
        color: status === 'saved' ? 'var(--iff-green)' : 'var(--iff-subtext)',
      }}
    >
      {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved ✓' : 'Saves automatically'}
    </span>
  )

  const capTable = (
    <div className="iff-card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '11px 14px', fontSize: 12.5, fontWeight: 800, borderBottom: '1px solid var(--iff-divider)' }}>
        Keeper budget · ${AUCTION_BUDGET}
      </div>
      {capRows.map((c, i) => (
        <div key={c.abbrev} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderTop: i ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
          <span style={{ flex: 1, fontSize: 12, fontWeight: 700, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {c.name}
          </span>
          <span className="tnum" style={{ width: 22, textAlign: 'right', fontSize: 11, color: 'var(--iff-subtext)' }}>{c.kept}</span>
          <span className="tnum" style={{ width: 44, textAlign: 'right', fontSize: 11.5, fontWeight: 700 }}>${c.salary}</span>
          <span className="tnum" style={{
            width: 48, textAlign: 'right', fontSize: 11.5, fontWeight: 800,
            color: c.room < 0 ? 'var(--iff-accent)' : c.room < 25 ? 'var(--iff-gold)' : 'var(--iff-green)',
          }}>
            {c.room < 0 ? `−$${-c.room}` : `$${c.room}`}
          </span>
        </div>
      ))}
      {capRows.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
          borderTop: '1px solid var(--iff-divider)', background: 'rgba(255,255,255,0.035)',
        }}>
          <span style={{ flex: 1, fontSize: 11.5, fontWeight: 900, letterSpacing: 0.4 }}>TOTAL</span>
          <span className="tnum" style={{ width: 22, textAlign: 'right', fontSize: 11, fontWeight: 800 }}>
            {capTotals.kept}
          </span>
          <span className="tnum" style={{ width: 44, textAlign: 'right', fontSize: 11.5, fontWeight: 900 }}>
            ${capTotals.salary}
          </span>
          <span className="tnum" style={{
            width: 48, textAlign: 'right', fontSize: 11.5, fontWeight: 900,
            color: capTotals.room < 0 ? 'var(--iff-accent)' : 'var(--iff-green)',
          }}>
            {capTotals.room < 0 ? `−$${-capTotals.room}` : `$${capTotals.room}`}
          </span>
        </div>
      )}
      <div style={{ padding: '8px 14px', borderTop: '1px solid var(--iff-divider)', fontSize: 10, color: 'var(--iff-subtext)' }}>
        Kept · committed · room left. Only players marked Keep count.
      </div>
    </div>
  )

  const board = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {TIERS.map((tier) => {
        const list = byTier[tier] ?? []
        if (list.length === 0) return null
        return (
          <div key={tier}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '0 2px 6px' }}>
              <span style={{ fontSize: 12.5, fontWeight: 900, letterSpacing: 0.4, textTransform: 'uppercase' }}>{tier}</span>
              <span className="tnum" style={{ fontSize: 10.5, color: 'var(--iff-subtext)' }}>{list.length}</span>
            </div>
            <div className="iff-card" style={{ padding: 0, overflow: 'hidden' }}>
              {list.map((r, i) => (
                <div key={r.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                  borderTop: i ? '1px solid rgba(255,255,255,0.04)' : 'none',
                  opacity: savingId === r.id ? 0.5 : 1,
                }}>
                  <span style={{ width: 26, fontSize: 10, fontWeight: 800, color: POS_COLOR[r.pos] ?? 'var(--iff-subtext)' }}>
                    {r.pos}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.player}
                  </span>
                  <span style={{ width: 44, fontSize: 10.5, color: 'var(--iff-subtext)' }}>{r.team}</span>
                  <span className="tnum" style={{ width: 38, textAlign: 'right', fontSize: 12, fontWeight: 700, color: 'var(--iff-green)' }}>
                    ${r.price ?? 0}
                  </span>
                  <span style={{ display: 'flex', gap: 3 }}>
                    <button onClick={() => moveTier(r, -1)} disabled={r.tier === TIERS[0]} aria-label={`Promote ${r.player}`}
                      style={{ fontSize: 12, padding: '2px 5px', color: 'var(--iff-subtext)' }}>▲</button>
                    <button onClick={() => moveTier(r, 1)} disabled={r.tier === TIERS[TIERS.length - 1]} aria-label={`Demote ${r.player}`}
                      style={{ fontSize: 12, padding: '2px 5px', color: 'var(--iff-subtext)' }}>▼</button>
                  </span>
                  <button
                    onClick={() => cycleKdm(r)}
                    aria-label={`${r.player} is ${KDM[r.kdm]?.label ?? 'Maybe'} — tap to change`}
                    style={{
                      width: 26, height: 22, borderRadius: 6, fontSize: 10.5, fontWeight: 900,
                      background: KDM[r.kdm]?.color ?? 'var(--iff-elevated)', color: '#fff', flexShrink: 0,
                    }}
                  >
                    {r.kdm ?? 'M'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )

  const heading = (
    <>
      <span style={{ fontSize: 11, color: 'var(--iff-subtext)' }}>
        {rows ? `${filtered.length} of ${rows.length}` : ''}
      </span>
    </>
  )

  const overlays = showSettings && <SettingsView onClose={() => setShowSettings(false)} />

  if (rows === null) return <LoadingList count={8} />

  if (rows.length === 0) {
    return (
      <div className="iff-card empty-state" style={{ margin: 16, padding: 32 }}>
        <div className="glyph">📋</div>
        <div className="title">Board is empty</div>
        <div>Run <strong>Admin → Data → Database → Import Big Board</strong> to bring your players over.</div>
        {error && <div style={{ marginTop: 10, color: 'var(--iff-accent)', fontSize: 12 }}>{error}</div>}
      </div>
    )
  }

  if (isDesktop) {
    return (
      <div>
        <div className="dash-hero-desktop">
          <h1>Big Board</h1>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {statusChip}
            <span className="season-chip tnum">{filtered.length} of {rows.length}</span>
          </span>
        </div>
        {error && <div className="iff-card" style={{ padding: 12, marginBottom: 12, color: 'var(--iff-accent)', fontSize: 12 }}>{error}</div>}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="iff-card" style={{ padding: 14, marginBottom: 16 }}>{filters}</div>
            {board}
          </div>
          <div style={{ width: 260, flexShrink: 0, position: 'sticky', top: 8 }}>{capTable}</div>
        </div>
        {overlays}
      </div>
    )
  }

  return (
    <div>
      <div className="nav-bar">
        <div className="nav-side" />
        <div className="nav-title">Big Board {heading}</div>
        <div className="nav-side right" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {statusChip}
          <button className="icon-btn" onClick={() => setShowSettings(true)} aria-label="Settings">⚙</button>
        </div>
      </div>
      <div style={{ padding: '0 14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {error && <div className="iff-card" style={{ padding: 12, color: 'var(--iff-accent)', fontSize: 12 }}>{error}</div>}
        <div className="iff-card" style={{ padding: 14 }}>{filters}</div>
        {capTable}
        {board}
      </div>
      {overlays}
    </div>
  )
}
