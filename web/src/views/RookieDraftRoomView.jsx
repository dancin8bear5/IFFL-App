// RookieDraftRoomView — the live rookie draft.
//
// The room has three states, and which one you see is the whole design:
//
//   1. NO ORDER YET (most of the year). Nobody knows their slot, because
//      the order comes out of the lottery and the playoff finish. So the
//      room shows what the league actually talks about all season: who
//      holds a 1st, who holds two 2nds, who traded theirs away.
//   2. BOARD PUBLISHED, ROOM CLOSED. The order exists and everyone can
//      see their slots — but no one can pick until the commissioner
//      opens the room.
//   3. LIVE. The team on the clock gets a pick form; everyone else gets
//      the board and the name of whoever they're waiting on.
//
// The rules that make the order are enforced in services/draftOrder.js and
// checked there by tests; this file is what those rules look like.
//
// The board a member sees is the PUBLISHED slot→owner map, not one derived
// live from the pick ledger, because the published map is what the
// security rules compare against. If they diverged, someone would see
// their own name on a slot and be refused by the database. When they do
// diverge — a pick traded after publishing — the commissioner is told, and
// republishing is one button.
import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { useIsDesktop } from '../hooks/useBreakpoint'
import { fantasyTeams } from '../data/staticData'
import { LoadingList } from '../components/shared'
import RookieDraftBoard from '../components/RookieDraftBoard'
import TeamLink from '../components/TeamLink'
import * as fs from '../services/firestoreService'
import { DRAFT_POSITIONS, slotOrder } from '../services/rookieDraft'
import {
  flattenBlocks, validateOrder, championHoldsLastPick, assignSlots,
  resolveSlotOwners, slotOwnerMap, pickState, holdingsByTeam, BLOCK_SIZE,
} from '../services/draftOrder'

const TEAM_NAMES = fantasyTeams.map((t) => t.name)

// Round-one picks cost $2, round two $1, and both escalate on the standard
// +($5 × years kept) curve — the same numbers the 2026 class carries.
const ROOKIE_BASE = { 1: 2, 2: 1 }

const BLOCK_META = [
  {
    key: 'lottery',
    title: 'Picks 1–4 · Lottery',
    hint: 'The four teams that missed the playoffs, in the order the lottery drew them.',
  },
  {
    key: 'firstRoundLosers',
    title: 'Picks 5–8 · Out in round one',
    hint: 'The four first-round playoff losers, worst regular-season finish first.',
  },
  {
    key: 'advanced',
    title: 'Picks 9–12 · Advanced',
    hint: 'The four who won a playoff game, inverse of final finish. The champion picks 1.12.',
  },
]

const emptyBlocks = () => ({ lottery: [], firstRoundLosers: [], advanced: [] })

export default function RookieDraftRoomView() {
  const { isAdmin, userTeam, uid, draftPicks, activeSeason, rookieDraft, saveRookieDraft, isPreview } = useApp()
  const isDesktop = useIsDesktop()

  const season = Number(rookieDraft?.season) || activeSeason + 1
  const live = rookieDraft?.live === true
  const published = rookieDraft?.slotOwners ?? null

  const [made, setMade] = useState(null)   // null = loading
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setMade(null)
    if (isPreview) {
      import('../data/previewData').then((d) => setMade(d.previewRookieDraftPicks ?? []))
      return
    }
    return fs.listenToRookieDraftPicks(season, setMade, (e) => { setError(e.message); setMade([]) })
  }, [season, isPreview])

  const madeBySlot = useMemo(
    () => Object.fromEntries((made ?? []).map((p) => [p.slot, p])),
    [made],
  )

  // ── the order ──────────────────────────────────────────────
  const savedBlocks = rookieDraft?.order ?? null
  const orderedTeams = useMemo(() => flattenBlocks(savedBlocks ?? {}), [savedBlocks])
  const hasOrder = orderedTeams.length === 12 && validateOrder(savedBlocks ?? {}, TEAM_NAMES).length === 0

  // Owners as the LEDGER says they are right now.
  const ledgerSlots = useMemo(
    () => (hasOrder ? resolveSlotOwners(assignSlots(orderedTeams), draftPicks, season) : []),
    [hasOrder, orderedTeams, draftPicks, season],
  )

  // Owners as PUBLISHED — what the security rules will accept.
  const slots = useMemo(() => {
    if (!published) return ledgerSlots
    return ledgerSlots.map((s) => {
      const owner = published[s.slot] ?? s.team
      return { ...s, team: owner, via: owner !== s.originalTeam ? s.originalTeam : null }
    })
  }, [ledgerSlots, published])

  // Picks that changed hands since the board was published. Until it's
  // republished the database still believes the old owner.
  const staleSlots = useMemo(
    () => (published ? ledgerSlots.filter((s) => published[s.slot] && published[s.slot] !== s.team) : []),
    [ledgerSlots, published],
  )

  const state = useMemo(
    () => pickState({ slots, made: madeBySlot, teamName: userTeam, isAdmin, live }),
    [slots, madeBySlot, userTeam, isAdmin, live],
  )

  // Board cells: a made pick fills its slot, an unmade one stays a slot.
  const cells = useMemo(
    () => slots.map((s) => {
      const p = madeBySlot[s.slot]
      if (!p) return s
      return { ...s, team: p.teamName, name: p.name, position: p.position, nflTeam: p.nflTeam }
    }),
    [slots, madeBySlot],
  )

  const holdings = useMemo(
    () => holdingsByTeam(draftPicks, season, TEAM_NAMES),
    [draftPicks, season],
  )

  // ── making a pick ──────────────────────────────────────────
  const [name, setName] = useState('')
  const [position, setPosition] = useState('WR')
  const [nflTeam, setNflTeam] = useState('')

  async function submit(e) {
    e?.preventDefault()
    const slot = state.slot
    if (!slot || !name.trim()) return
    setBusy(true)
    setError(null)
    try {
      await fs.submitRookiePick({
        season,
        slot: slot.slot,
        round: slot.round,
        pickNumber: slot.pickNumber,
        // The commissioner picking for a sleeping manager still records
        // the pick under the team that owns the slot, never under his.
        teamName: slot.team,
        name,
        position,
        nflTeam,
        uid,
      })
      setName(''); setNflTeam('')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (made === null) return <LoadingList count={6} />

  const statusChip = (
    <span className="season-chip" style={{
      color: live ? 'var(--iff-green)' : 'var(--iff-subtext)',
      whiteSpace: 'nowrap',
    }}>
      {/* "Live" only ever means a draft that can actually be picked in —
          an open room with no order is not a draft in progress. */}
      {!hasOrder ? 'Order pending' : state.complete ? 'Complete' : live ? 'Live' : 'Opens soon'}
    </span>
  )

  const clockBanner = hasOrder && !state.complete && (
    <div className="iff-card" style={{
      padding: 14,
      border: state.canPick ? '1.5px solid var(--iff-accent)' : undefined,
    }}>
      {state.canPick ? (
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 800 }}>
            <span className="tnum">{state.slot.slot}</span> · {state.slot.team}
            {state.slot.team !== userTeam && (
              <span style={{ fontWeight: 600, color: 'var(--iff-subtext)' }}> — you're picking as commissioner</span>
            )}
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Player name"
            aria-label="Player name"
            autoFocus
          />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {DRAFT_POSITIONS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPosition(p)}
                aria-pressed={p === position}
                style={{
                  padding: '6px 16px', borderRadius: 18, fontSize: 12, fontWeight: 800,
                  background: p === position ? 'var(--iff-accent)' : 'var(--iff-elevated)',
                  color: p === position ? '#fff' : 'var(--iff-subtext)',
                }}
              >
                {p}
              </button>
            ))}
          </div>
          <input
            value={nflTeam}
            onChange={(e) => setNflTeam(e.target.value)}
            placeholder="NFL team (optional)"
            aria-label="NFL team"
          />
          <button
            type="submit"
            disabled={busy || !name.trim()}
            style={{
              padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 800,
              background: 'var(--iff-accent)', color: '#fff', opacity: busy || !name.trim() ? 0.5 : 1,
            }}
          >
            {busy ? 'Submitting…' : `Draft with ${state.slot.slot}`}
          </button>
        </form>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span className="tnum" style={{ fontSize: 15, fontWeight: 900 }}>{state.onClock?.slot}</span>
          <span style={{ fontSize: 13, fontWeight: 700 }}>
            {state.onClock ? <TeamLink name={state.onClock.team} /> : null}
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--iff-subtext)' }}>{state.reason}</span>
        </div>
      )}
      {state.myOpenSlots.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--iff-subtext)' }}>
          Your remaining picks: <span className="tnum" style={{ color: 'var(--iff-text)', fontWeight: 700 }}>
            {state.myOpenSlots.map((s) => s.slot).join(', ')}
          </span>
        </div>
      )}
    </div>
  )

  // ── the all-year view: who holds what ──────────────────────
  const holdingsCard = (
    <div className="iff-card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '11px 14px', borderBottom: '1px solid var(--iff-divider)' }}>
        <div style={{ fontSize: 12.5, fontWeight: 800 }}>Who holds what · {season}</div>
        <div style={{ fontSize: 10.5, color: 'var(--iff-subtext)', marginTop: 3, lineHeight: 1.5 }}>
          Everyone starts with one 1st and one 2nd. Slots aren't known until the season ends —
          the bottom four go to a lottery for 1.01–1.04, first-round playoff losers take 1.05–1.08
          by inverse finish, and the four who advanced take 1.09–1.12, champion last.
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', fontSize: 10, fontWeight: 800, letterSpacing: 0.4, color: 'var(--iff-subtext)', textTransform: 'uppercase' }}>
        <span style={{ flex: 1 }}>Team</span>
        <span style={{ width: 34, textAlign: 'right' }}>1st</span>
        <span style={{ width: 34, textAlign: 'right' }}>2nd</span>
        <span style={{ width: 40, textAlign: 'right' }}>Total</span>
      </div>
      {holdings.map((h, i) => (
        <div key={h.team} style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
          borderTop: '1px solid rgba(255,255,255,0.04)',
          background: h.team === userTeam ? 'rgba(255,255,255,0.035)' : 'none',
        }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 700 }}>
            <TeamLink name={h.team} />
          </span>
          <span className="tnum" style={{ width: 34, textAlign: 'right', fontSize: 12, color: h.rounds[1] ? 'var(--iff-text)' : 'var(--iff-subtext)' }}>
            {h.rounds[1] ?? 0}
          </span>
          <span className="tnum" style={{ width: 34, textAlign: 'right', fontSize: 12, color: h.rounds[2] ? 'var(--iff-text)' : 'var(--iff-subtext)' }}>
            {h.rounds[2] ?? 0}
          </span>
          <span className="tnum" style={{ width: 40, textAlign: 'right', fontSize: 12.5, fontWeight: 800 }}>{h.total}</span>
        </div>
      ))}
      {holdings.every((h) => h.total === 0) && (
        <div style={{ padding: '14px', fontSize: 11.5, color: 'var(--iff-subtext)' }}>
          No {season} picks are on file yet. They appear here as soon as the commissioner adds them.
        </div>
      )}
    </div>
  )

  const body = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {error && (
        <div className="iff-card" style={{ padding: 12, color: 'var(--iff-accent)', fontSize: 12 }}>{error}</div>
      )}
      {isAdmin && (
        <AdminPanel
          season={season}
          live={live}
          savedBlocks={savedBlocks}
          published={published}
          staleSlots={staleSlots}
          ledgerSlots={ledgerSlots}
          hasOrder={hasOrder}
          champion={rookieDraft?.champion ?? ''}
          madePicks={made}
          save={saveRookieDraft}
          draftPicks={draftPicks}
          isPreview={isPreview}
        />
      )}
      {clockBanner}
      {hasOrder && state.complete && (
        <div className="iff-card" style={{ padding: 12, fontSize: 12, color: 'var(--iff-subtext)' }}>
          All {cells.length} picks are in. The class stays here as the record of the draft.
        </div>
      )}
      {hasOrder && (
        <RookieDraftBoard
          picks={cells}
          season={season}
          onClockSlot={state.onClock?.slot ?? null}
          highlightTeam={userTeam}
        />
      )}
      {/* Holdings stay below the board even during the draft: they're the
          answer to "what do I still have next year", which trades change
          mid-draft. Before the order exists they're the whole page. */}
      {holdingsCard}
    </div>
  )

  if (isDesktop) {
    return (
      <div>
        <div className="dash-hero-desktop">
          <h1>Rookie Draft {season}</h1>
          {statusChip}
        </div>
        {body}
      </div>
    )
  }

  return (
    <div>
      <div className="nav-bar">
        <div className="nav-side" />
        <div className="nav-title">Rookie Draft {season}</div>
        <div className="nav-side right">{statusChip}</div>
      </div>
      <div style={{ padding: '0 14px 16px' }}>{body}</div>
    </div>
  )
}

// ── commissioner controls ────────────────────────────────────
//
// Deliberately part of the room rather than another section of Admin: the
// order, the board and the switch that opens the door are the same job,
// and doing that job means looking at the board while you do it.
function AdminPanel({
  season, live, savedBlocks, published, staleSlots, ledgerSlots, hasOrder,
  champion, madePicks, save, draftPicks, isPreview,
}) {
  const [open, setOpen] = useState(!hasOrder)
  const [blocks, setBlocks] = useState(() => ({ ...emptyBlocks(), ...(savedBlocks ?? {}) }))
  const [dirty, setDirty] = useState(false)
  const [seasonInput, setSeasonInput] = useState(String(season))
  const [championPick, setChampionPick] = useState(champion)
  const [busy, setBusy] = useState(null)
  const [note, setNote] = useState(null)

  // Take a saved order that arrived from someone else's edit — but never
  // over the top of a half-typed one.
  useEffect(() => {
    if (!dirty) setBlocks({ ...emptyBlocks(), ...(savedBlocks ?? {}) })
  }, [savedBlocks, dirty])

  const problems = validateOrder(blocks, TEAM_NAMES)
  const complete = flattenBlocks(blocks).length === 12
  const championOk = championHoldsLastPick(blocks, championPick)
  const canPublish = complete && problems.length === 0

  function setTeamAt(key, i, value) {
    setDirty(true)
    setBlocks((prev) => {
      const block = [...(prev[key] ?? [])]
      while (block.length < BLOCK_SIZE) block.push('')
      block[i] = value
      return { ...prev, [key]: block }
    })
  }

  async function publish() {
    setBusy('publish')
    setNote(null)
    try {
      const resolved = resolveSlotOwners(assignSlots(flattenBlocks(blocks)), draftPicks, Number(seasonInput))
      await save({
        season: Number(seasonInput),
        order: blocks,
        champion: championPick || null,
        slotOwners: slotOwnerMap(resolved),
      })
      setDirty(false)
      setNote('Board published. Members can see their slots.')
    } catch (e) {
      setNote(e.message)
    } finally {
      setBusy(null)
    }
  }

  async function republish() {
    setBusy('republish')
    try {
      await save({ slotOwners: slotOwnerMap(ledgerSlots) })
      setNote(`Board refreshed — ${staleSlots.length} slot${staleSlots.length === 1 ? '' : 's'} moved.`)
    } catch (e) {
      setNote(e.message)
    } finally {
      setBusy(null)
    }
  }

  async function toggleLive() {
    setBusy('live')
    try {
      await save({ live: !live })
      setNote(!live ? 'The room is open.' : 'The room is closed.')
    } catch (e) {
      setNote(e.message)
    } finally {
      setBusy(null)
    }
  }

  async function undo(pick) {
    if (!window.confirm(`Take ${pick.name} back off ${pick.slot}?`)) return
    setBusy(pick.slot)
    try {
      await fs.undoRookiePick(season, pick.slot)
      setNote(`${pick.slot} is open again.`)
    } catch (e) {
      setNote(e.message)
    } finally {
      setBusy(null)
    }
  }

  // The end of the draft: every selection becomes a real rostered player
  // on the standard rookie contract, and the spent picks retire.
  async function pushToRosters() {
    const rookies = [...madePicks].sort((a, b) => slotOrder(a.slot) - slotOrder(b.slot))
    if (rookies.length === 0) return
    if (!window.confirm(
      `Add ${rookies.length} drafted rookie${rookies.length === 1 ? '' : 's'} to their rosters and retire the ${season} picks? ` +
      'Round 1 lands at $2, round 2 at $1.',
    )) return
    setBusy('push')
    try {
      const payload = rookies.map((p) => {
        const base = ROOKIE_BASE[p.round] ?? 1
        return {
          slot: p.slot,
          round: p.round,
          name: p.name,
          position: p.position,
          nflTeam: p.nflTeam,
          team: p.teamName,
          // +($5 × years kept): $2 → $7 → $17 for a first, $1 → $6 → $16
          // for a second. Same curve the 2026 class carries.
          prices: { [season]: base, [season + 1]: base + 5, [season + 2]: base + 15 },
          originalPrice: base,
          via: null,
        }
      })
      const res = await fs.seedRookieClass(payload, season)
      setNote(`${res.added} added, ${res.skipped} already on a roster, ${res.picksRetired} picks retired.`)
    } catch (e) {
      setNote(e.message)
    } finally {
      setBusy(null)
    }
  }

  const btn = (label, onClick, { primary = false, disabled = false, key = '' } = {}) => (
    <button
      onClick={onClick}
      disabled={disabled || busy !== null}
      style={{
        padding: '8px 14px', borderRadius: 9, fontSize: 12, fontWeight: 800,
        background: primary ? 'var(--iff-accent)' : 'var(--iff-elevated)',
        color: primary ? '#fff' : 'var(--iff-text)',
        opacity: disabled || busy !== null ? 0.5 : 1,
      }}
    >
      {busy === key ? 'Working…' : label}
    </button>
  )

  const recent = [...madePicks].sort((a, b) => slotOrder(b.slot) - slotOrder(a.slot)).slice(0, 5)

  return (
    <div className="iff-card" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--iff-divider)' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', textAlign: 'left' }}
      >
        <span style={{ flex: 1, fontSize: 12.5, fontWeight: 800 }}>Commissioner · draft controls</span>
        <span style={{ fontSize: 10.5, color: live ? 'var(--iff-green)' : 'var(--iff-subtext)', fontWeight: 700 }}>
          {live ? 'ROOM OPEN' : 'ROOM CLOSED'}
        </span>
        <span style={{ color: 'var(--iff-subtext)' }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {note && (
            <div style={{ fontSize: 11.5, color: 'var(--iff-subtext)', paddingTop: 4 }}>{note}</div>
          )}

          {staleSlots.length > 0 && (
            <div style={{ padding: 10, borderRadius: 8, background: 'rgba(230,57,70,0.10)', fontSize: 11.5, lineHeight: 1.5 }}>
              <strong>{staleSlots.length} pick{staleSlots.length === 1 ? ' has' : 's have'} changed hands</strong> since
              the board was published ({staleSlots.map((s) => s.slot).join(', ')}). Until you republish, the
              database still thinks the old owner holds {staleSlots.length === 1 ? 'it' : 'them'}.
              <div style={{ marginTop: 8 }}>{btn('Republish board', republish, { key: 'republish' })}</div>
            </div>
          )}

          {/* Season + champion */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ fontSize: 11, color: 'var(--iff-subtext)' }}>
              Draft year
              <input
                value={seasonInput}
                onChange={(e) => { setDirty(true); setSeasonInput(e.target.value.replace(/\D/g, '')) }}
                inputMode="numeric"
                style={{ display: 'block', width: 90, marginTop: 4 }}
              />
            </label>
            <label style={{ fontSize: 11, color: 'var(--iff-subtext)' }}>
              Reigning champion
              <select
                value={championPick}
                onChange={(e) => { setDirty(true); setChampionPick(e.target.value) }}
                style={{ display: 'block', marginTop: 4, minWidth: 150 }}
              >
                <option value="">—</option>
                {TEAM_NAMES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
          </div>

          {/* The three blocks */}
          {BLOCK_META.map((meta) => (
            <div key={meta.key}>
              <div style={{ fontSize: 11.5, fontWeight: 800 }}>{meta.title}</div>
              <div style={{ fontSize: 10.5, color: 'var(--iff-subtext)', margin: '2px 0 6px', lineHeight: 1.5 }}>{meta.hint}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 6 }}>
                {Array.from({ length: BLOCK_SIZE }, (_, i) => (
                  <select
                    key={i}
                    value={blocks[meta.key]?.[i] ?? ''}
                    onChange={(e) => setTeamAt(meta.key, i, e.target.value)}
                    aria-label={`${meta.title} slot ${i + 1}`}
                    style={{ fontSize: 12 }}
                  >
                    <option value="">—</option>
                    {TEAM_NAMES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                ))}
              </div>
            </div>
          ))}

          {problems.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11.5, color: 'var(--iff-accent)', lineHeight: 1.6 }}>
              {problems.map((p) => <li key={p}>{p}</li>)}
            </ul>
          )}
          {complete && problems.length === 0 && !championOk && (
            <div style={{ fontSize: 11.5, color: 'var(--iff-gold)' }}>
              {championPick} won the belt, so 1.12 should be theirs — it's currently{' '}
              {blocks.advanced?.[BLOCK_SIZE - 1] || 'empty'}. Publish anyway if that's really the order.
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {btn(published ? 'Republish order' : 'Publish board', publish, { primary: true, disabled: !canPublish, key: 'publish' })}
            {btn(live ? 'Close the room' : 'Open the room', toggleLive, { disabled: !published, key: 'live' })}
            {madePicks.length > 0 && btn(`Push ${madePicks.length} to rosters`, pushToRosters, { key: 'push' })}
          </div>
          {!published && (
            <div style={{ fontSize: 10.5, color: 'var(--iff-subtext)' }}>
              The room can't open until the board is published — the published slots are what the
              database checks a pick against.
            </div>
          )}
          {isPreview && (
            <div style={{ fontSize: 10.5, color: 'var(--iff-subtext)' }}>
              Preview mode — nothing here is saved.
            </div>
          )}

          {recent.length > 0 && (
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 800, marginBottom: 6 }}>Undo a pick</div>
              {recent.map((p) => (
                <div key={p.slot} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 11.5 }}>
                  <span className="tnum" style={{ width: 38, fontWeight: 800 }}>{p.slot}</span>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.name} <span style={{ color: 'var(--iff-subtext)' }}>· {p.teamName}</span>
                  </span>
                  <button
                    onClick={() => undo(p)}
                    disabled={busy !== null}
                    aria-label={`Undo ${p.slot}`}
                    style={{ padding: '3px 9px', borderRadius: 7, fontSize: 11, fontWeight: 800, background: 'var(--iff-elevated)', color: 'var(--iff-subtext)' }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
