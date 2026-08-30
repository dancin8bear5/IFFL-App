// HistoryQueryView — one search box over the league's whole paper trail.
//
// Rookie picks, auction picks and trades live in three different places and
// three different shapes. This page exists so that answering "what happened
// with Breece Hall" doesn't require knowing which one to open.
//
// The searching itself is in services/historySearch.js and is tested there.
// This file is the screen: it loads the sources, holds the filter state, and
// renders a result three ways.
//
// It is deliberately built ahead of most of its data. The auction drafts and
// the older trades aren't fully seeded yet, so every source degrades to "not
// seeded yet" on its own — a page that renders empty with no explanation is
// indistinguishable from a broken one, and this page will spend a while with
// at least one source missing.
import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { useIsDesktop } from '../hooks/useBreakpoint'
import { fantasyTeams, POSITION_COLORS, POSITION_INK } from '../data/staticData'
import { ChipScroller, LoadingList } from '../components/shared'
import TeamLink from '../components/TeamLink'
import * as fs from '../services/firestoreService'
import { rookieDraftHistory } from '../data/rookieDraftHistory'
import { rookieClass2026 } from '../data/rookieDraft2026'
import {
  buildIndex, searchHistory, seasonsIn, KINDS, KIND_LABELS, BROWSE_LIMIT,
} from '../services/historySearch'

const POSITIONS = ['QB', 'RB', 'WR', 'TE']
const TEAM_NAMES = fantasyTeams.map((t) => t.name)


/** Every rookie class we hold, keyed by season. */
const ROOKIE_SOURCE = { ...rookieDraftHistory, 2026: rookieClass2026 }

export default function HistoryQueryView() {
  const { userTeam, isPreview, trades: liveTrades } = useApp()
  const isDesktop = useIsDesktop()

  const [auction, setAuction] = useState(null)   // null = still loading
  const [trades, setTrades] = useState(null)

  const [text, setText] = useState('')
  const [kind, setKind] = useState('all')
  const [team, setTeam] = useState('ALL')
  const [position, setPosition] = useState('ALL')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  useEffect(() => {
    let cancelled = false
    if (isPreview) {
      // Preview has no Firestore. The sample trades already in context are
      // the right stand-in — they exercise the trade adapter and the
      // two-teams-one-record rendering, which is the part worth looking at.
      setAuction([])
      setTrades(liveTrades ?? [])
      return
    }
    // Both are one-shot reads of everything, so they're paid for once when
    // the page opens rather than kept on a listener like live data.
    fs.fetchHistoryDrafts().then((d) => !cancelled && setAuction(d))
    fs.fetchAllTrades().then((t) => !cancelled && setTrades(t))
    return () => { cancelled = true }
  }, [isPreview, liveTrades])

  const loading = auction === null || trades === null

  const index = useMemo(
    () => buildIndex({ rookie: ROOKIE_SOURCE, auction: auction ?? [], trades: trades ?? [] }),
    [auction, trades],
  )

  const seasons = useMemo(() => seasonsIn(index), [index])

  const { results, total, counts } = useMemo(
    () => searchHistory(index, {
      text,
      kinds: kind === 'all' ? null : [kind],
      teams: team === 'ALL' ? null : [team],
      positions: position === 'ALL' ? null : [position],
      seasonFrom: from ? Number(from) : null,
      seasonTo: to ? Number(to) : null,
    }),
    [index, text, kind, team, position, from, to],
  )

  const filtered = text || kind !== 'all' || team !== 'ALL' || position !== 'ALL' || from || to
  const clearAll = () => { setText(''); setKind('all'); setTeam('ALL'); setPosition('ALL'); setFrom(''); setTo('') }

  // What each source contributes, counted off the INDEX rather than off what
  // was fetched. Those differ — an offer nobody accepted is a trade document
  // but not a piece of history — and a strip that disagreed with the chips
  // above it would just look like a bug.
  const indexed = useMemo(() => {
    const n = Object.fromEntries(KINDS.map((k) => [k, 0]))
    for (const r of index) if (n[r.kind] != null) n[r.kind] += 1
    return n
  }, [index])

  const sourceState = [
    { key: 'rookie', n: indexed.rookie, hint: 'recovered from the ESPN export' },
    { key: 'auction', n: indexed.auction, hint: 'historyDrafts — seed to fill' },
    { key: 'trade', n: indexed.trade, hint: 'trades collection — seed to fill' },
  ]

  const search = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <input
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Search a player, a team, a season, a slot…"
        aria-label="Search league history"
        autoFocus={isDesktop}
        style={{ fontSize: 15, padding: '11px 13px' }}
      />

      <ChipScroller>
        <div style={{ display: 'flex', gap: 6, width: 'max-content' }}>
          {[{ key: 'all', label: 'Everything' }, ...KINDS.map((k) => ({ key: k, label: KIND_LABELS[k] }))].map((k) => {
            const on = kind === k.key
            const n = k.key === 'all' ? Object.values(counts).reduce((a, c) => a + c, 0) : counts[k.key]
            return (
              <button
                key={k.key}
                onClick={() => setKind(k.key)}
                aria-pressed={on}
                style={{
                  padding: '6px 14px', borderRadius: 18, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
                  background: on ? 'var(--iff-accent)' : 'var(--iff-elevated)',
                  color: on ? '#fff' : 'var(--iff-subtext)',
                }}
              >
                {k.label}
                {/* Counts are computed before the kind filter, so picking one
                    doesn't make every other chip read zero. */}
                <span className="tnum" style={{ marginLeft: 6, opacity: 0.75, fontWeight: 600 }}>{n}</span>
              </button>
            )
          })}
        </div>
      </ChipScroller>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Filter by team"
          style={{ width: 'auto', fontSize: 12, padding: '7px 9px', minWidth: 130 }}>
          <option value="ALL">All teams</option>
          {TEAM_NAMES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>

        <select value={position} onChange={(e) => setPosition(e.target.value)} aria-label="Filter by position"
          style={{ width: 'auto', fontSize: 12, padding: '7px 9px' }}>
          <option value="ALL">All positions</option>
          {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>

        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--iff-subtext)' }}>
          <select value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From season"
            style={{ width: 'auto', fontSize: 12, padding: '7px 9px' }}>
            <option value="">Any year</option>
            {seasons.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          to
          <select value={to} onChange={(e) => setTo(e.target.value)} aria-label="To season"
            style={{ width: 'auto', fontSize: 12, padding: '7px 9px' }}>
            <option value="">Any year</option>
            {seasons.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </span>

        {filtered && (
          <button onClick={clearAll}
            style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--iff-subtext)', padding: '6px 10px' }}>
            Clear
          </button>
        )}
      </div>
    </div>
  )

  const countLine = (
    <div style={{ fontSize: 11.5, color: 'var(--iff-subtext)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <span>
        <strong className="tnum" style={{ color: 'var(--iff-text)' }}>{total}</strong>
        {total === 1 ? ' record' : ' records'}
        {total > results.length && ` · showing the first ${results.length}`}
      </span>
      {!filtered && total > BROWSE_LIMIT && <span>Type to narrow it down.</span>}
    </div>
  )

  const empty = (
    <div className="iff-card empty-state" style={{ padding: 28 }}>
      <div className="glyph">🔍</div>
      <div className="title">{index.length === 0 ? 'No history loaded yet' : 'Nothing matches'}</div>
      <div style={{ fontSize: 12, color: 'var(--iff-subtext)', lineHeight: 1.6, marginTop: 4 }}>
        {index.length === 0
          ? 'Rookie classes are bundled with the app; auction drafts and trades come from Firestore once they are seeded.'
          : 'Try a surname on its own, or clear a filter.'}
      </div>
      {index.length > 0 && filtered && (
        <button onClick={clearAll} style={{ marginTop: 12, padding: '8px 16px', borderRadius: 9, fontSize: 12, fontWeight: 700, background: 'var(--iff-elevated)', color: 'var(--iff-text)' }}>
          Clear filters
        </button>
      )}
    </div>
  )

  const sources = (
    <div className="iff-card" style={{ padding: '10px 14px', display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11, color: 'var(--iff-subtext)' }}>
      {sourceState.map((s) => (
        <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{
            width: 7, height: 7, borderRadius: 4,
            background: s.n > 0 ? 'var(--iff-green)' : 'var(--iff-subtext)', opacity: s.n > 0 ? 1 : 0.4,
          }} />
          {KIND_LABELS[s.key]}
          <strong className="tnum" style={{ color: s.n > 0 ? 'var(--iff-text)' : 'var(--iff-subtext)' }}>{s.n}</strong>
          {s.n === 0 && <span style={{ opacity: 0.7 }}>· {s.hint}</span>}
        </span>
      ))}
    </div>
  )

  const body = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="iff-card" style={{ padding: 14 }}>{search}</div>
      {sources}
      {loading ? <LoadingList count={6} /> : (
        <>
          {countLine}
          {results.length === 0 ? empty : (
            <div className="iff-card" style={{ padding: 0, overflow: 'hidden' }}>
              {results.map((r, i) => <ResultRow key={r.id} record={r} first={i === 0} mine={userTeam} />)}
            </div>
          )}
        </>
      )}
    </div>
  )

  if (isDesktop) {
    return (
      <div>
        <div className="dash-hero-desktop">
          <h1>History</h1>
          <span className="season-chip tnum">{index.length} records</span>
        </div>
        {body}
      </div>
    )
  }

  return (
    <div>
      <div className="nav-bar">
        <div className="nav-side" />
        <div className="nav-title">History</div>
        <div className="nav-side right" />
      </div>
      <div style={{ padding: '0 14px 16px' }}>{body}</div>
    </div>
  )
}

/** One result. The three kinds share a frame and differ in the middle. */
function ResultRow({ record, first, mine }) {
  const r = record
  const badge =
    r.kind === 'rookie' ? (r.slot ?? (r.round ? `R${r.round}` : '—'))
      : r.kind === 'auction' ? (r.price != null ? `$${r.price}` : '—')
      : '⇄'

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 13px',
      borderTop: first ? 'none' : '1px solid rgba(255,255,255,0.05)',
    }}>
      <span
        title={KIND_LABELS[r.kind]}
        className="tnum"
        style={{
          flexShrink: 0, minWidth: 42, textAlign: 'center', padding: '3px 6px', borderRadius: 6,
          fontSize: 11, fontWeight: 800, background: 'var(--iff-elevated)',
          color: r.kind === 'rookie' ? 'var(--iff-gold)' : r.kind === 'auction' ? 'var(--iff-green)' : 'var(--iff-subtext)',
        }}
      >
        {badge}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        {r.kind === 'trade' ? (
          <TradeBody record={r} mine={mine} />
        ) : (
          <>
            <div style={{ fontSize: 13.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {r.title || '—'}
              {r.positions[0] && (
                <span style={{
                  fontSize: 9.5, fontWeight: 800, padding: '1px 5px', borderRadius: 3,
                  background: POSITION_COLORS[r.positions[0]] ?? 'var(--iff-elevated)',
                  color: POSITION_COLORS[r.positions[0]] ? POSITION_INK : 'var(--iff-subtext)',
                }}>
                  {r.positions[0]}
                </span>
              )}
              {r.keeper && <span style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--iff-subtext)' }}>KEPT</span>}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--iff-subtext)', marginTop: 2 }}>
              {r.teams[0] ? <TeamLink name={r.teams[0]} muted /> : null}
              {/* The position is already the chip above — repeating it here
                  reads as a stutter, so only the NFL club goes on this line. */}
              {r.nflTeam && <span> · {r.nflTeam}</span>}
              {r.kind === 'auction' && r.overallPick != null && <span> · pick {r.overallPick}</span>}
            </div>
          </>
        )}
      </div>

      <span className="tnum" style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 700, color: 'var(--iff-subtext)' }}>
        {r.season}
      </span>
    </div>
  )
}

/** A trade reads as what each side GOT — the way people remember them. */
function TradeBody({ record, mine }) {
  const [a, b] = record.teams
  const got = (teamName, other) => record.gave?.[other] ?? []
  return (
    <div>
      <div style={{ fontSize: 13.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
        <TeamLink name={a} bold={700} />
        <span style={{ color: 'var(--iff-subtext)', fontWeight: 500 }}>↔</span>
        <TeamLink name={b} bold={700} />
      </div>
      {[[a, b], [b, a]].map(([team, other]) => {
        const assets = got(team, other)
        if (assets.length === 0) return null
        return (
          <div key={team} style={{
            fontSize: 11.5, marginTop: 2,
            color: team === mine ? 'var(--iff-text)' : 'var(--iff-subtext)',
          }}>
            <span style={{ fontWeight: 700 }}>{team}</span> got {assets.join(', ')}
          </div>
        )
      })}
    </div>
  )
}
