// LastSeasonView + LeagueHistoryTable — the other two dashboard tiles.
// LastSeasonView: final standings from the most recent completed season.
// LeagueHistoryTable: every sortable all-time stat we have, in one table.
import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { teamByName } from '../data/staticData'
import { DetailOverlay, BeltRow, TeamAvatar } from './shared'
import TeamLink from './TeamLink'
import { computeAllTimeStats, defaultSort, PLAYOFF_CUTOFF } from '../services/leagueStats'

/* ═══════════ Last Season ═══════════ */

export function LastSeasonView({ onClose }) {
  const { leagueHistory } = useApp()
  const latest = leagueHistory[0] ?? null

  return (
    <DetailOverlay title={latest ? `${latest.season} Season` : 'Last Season'} onBack={onClose}>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!latest ? (
          <div className="empty-state">
            <div className="glyph">📊</div>
            <div className="title">No season data</div>
            <div>League history hasn't been seeded yet.</div>
          </div>
        ) : (
          <>
            <div className="iff-card" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ fontSize: 34 }}>🏆</span>
              <span style={{ flex: 1 }}>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--iff-subtext)', textTransform: 'uppercase', letterSpacing: 1 }}>
                  {latest.season} Champion
                </span>
                <span style={{ display: 'block', fontSize: 22, fontWeight: 900, letterSpacing: -0.5 }}><TeamLink name={latest.champion} /></span>
                {latest.runnerUp && (
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--iff-subtext)', marginTop: 2 }}>
                    def. <TeamLink name={latest.runnerUp} /> in the final
                  </span>
                )}
              </span>
            </div>

            <div className="iff-card" style={{ overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 56px 64px', padding: '10px 14px', fontSize: 10, fontWeight: 700, color: 'var(--iff-subtext)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid var(--iff-divider)' }}>
                <span /><span>Team</span><span style={{ textAlign: 'center' }}>W-L</span><span style={{ textAlign: 'right' }}>PF</span>
              </div>
              {[...(latest.standings ?? [])].sort((a, b) => a.place - b.place).map((s) => (
                <div key={s.teamName} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 56px 64px', padding: '8px 14px', fontSize: 13, alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <span className="tnum" style={{ fontWeight: 700, color: s.place === 1 ? 'var(--iff-gold)' : s.place === 2 ? '#B8B8C8' : s.place === 3 ? '#CD7F32' : 'var(--iff-subtext)' }}>
                    {s.place}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <TeamLink name={s.teamName} /> <BeltRow count={teamByName[s.teamName]?.beltWins ?? 0} size={8} />
                  </span>
                  <span className="tnum" style={{ textAlign: 'center', color: 'var(--iff-subtext)', fontSize: 12 }}>{s.record ?? '—'}</span>
                  <span className="tnum" style={{ textAlign: 'right', color: s.place <= PLAYOFF_CUTOFF ? 'var(--iff-green)' : 'var(--iff-subtext)', fontSize: 12 }}>
                    {s.pointsFor != null ? s.pointsFor.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—'}
                  </span>
                </div>
              ))}
            </div>

            {(latest.notableTrades ?? []).map((t, i) => (
              <div key={i} style={{ padding: '8px 12px', background: 'rgba(244,162,97,0.07)', borderRadius: 8, borderLeft: '2px solid var(--iff-gold)', fontSize: 11, color: 'var(--iff-subtext)', lineHeight: 1.5 }}>
                <strong style={{ color: 'var(--iff-text)' }}>Notable:</strong> {t}
              </div>
            ))}
          </>
        )}
      </div>
    </DetailOverlay>
  )
}

/* ═══════════ League History (sortable all-time table) ═══════════ */

const COLUMNS = [
  { key: 'team',          label: 'Team',     align: 'left'  },
  { key: 'seasons',       label: 'Szn',      align: 'right' },
  { key: 'w',             label: 'W',        align: 'right' },
  { key: 'l',             label: 'L',        align: 'right' },
  { key: 't',             label: 'T',        align: 'right' },
  { key: 'pct',           label: 'Pct',      align: 'right', fmt: (v) => (v * 100).toFixed(1) },
  { key: 'championships', label: '🏆',       align: 'right' },
  { key: 'runnerUps',     label: '🥈',       align: 'right' },
  { key: 'finals',        label: 'Finals',   align: 'right' },
  { key: 'top3',          label: 'Top 3',    align: 'right' },
  { key: 'top5',          label: 'Top 5',    align: 'right' },
  { key: 'playoffs',      label: 'Playoffs', align: 'right' },
  { key: 'pointsFor',     label: 'PF',       align: 'right', fmt: (v) => (v == null ? '—' : v.toLocaleString('en-US', { maximumFractionDigits: 0 })) },
  { key: 'bestFinish',    label: 'Best',     align: 'right', fmt: (v) => (v == null ? '—' : `#${v}`), asc: true },
  { key: 'avgFinish',     label: 'Avg Fin',  align: 'right', fmt: (v) => (v == null ? '—' : v.toFixed(1)), asc: true },
]

export function LeagueHistoryTable({ onClose }) {
  const { leagueHistory } = useApp()
  const [sort, setSort] = useState({ key: null, desc: true }) // null = default belt order
  const [showInactive, setShowInactive] = useState(false)

  const rows = useMemo(() => {
    let stats = computeAllTimeStats(leagueHistory)
    if (!showInactive) stats = stats.filter((r) => r.active)
    if (!sort.key) return defaultSort(stats)
    const col = COLUMNS.find((c) => c.key === sort.key)
    const dir = sort.desc ? -1 : 1
    return [...stats].sort((a, b) => {
      const av = a[sort.key], bv = b[sort.key]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'string') return av.localeCompare(bv) * dir
      return (av - bv) * dir
    })
  }, [leagueHistory, sort, showInactive])

  function clickSort(col) {
    setSort((s) =>
      s.key === col.key
        ? { key: col.key, desc: !s.desc }
        : { key: col.key, desc: !col.asc }, // finish columns default ascending (lower = better)
    )
  }

  const arrow = (key) => (sort.key === key ? (sort.desc ? ' ↓' : ' ↑') : '')

  return (
    <DetailOverlay title="League History" onBack={onClose} desktop="wide">
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 11, color: 'var(--iff-subtext)', lineHeight: 1.5, flex: 1, minWidth: 200 }}>
            All-time franchise table across {leagueHistory.length} seasons. Tap any column to sort.
            Playoffs = Top {PLAYOFF_CUTOFF} finish.
          </div>
          <button
            onClick={() => setShowInactive((v) => !v)}
            style={{
              fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 16, whiteSpace: 'nowrap',
              background: showInactive ? 'var(--iff-accent)' : 'var(--iff-elevated)',
              color: showInactive ? '#fff' : 'var(--iff-subtext)',
            }}
          >
            {showInactive ? 'Showing former members' : 'Show former members'}
          </button>
        </div>

        {rows.length === 0 ? (
          <div className="empty-state">
            <div className="glyph">📜</div>
            <div className="title">No history yet</div>
            <div>Stats appear once league history is seeded.</div>
          </div>
        ) : (
          <div className="iff-card" style={{ overflowX: 'auto' }}>
            <table className="alltime-table">
              <thead>
                <tr>
                  {COLUMNS.map((c) => (
                    <th key={c.key} style={{ textAlign: c.align }}>
                      <button onClick={() => clickSort(c)}>{c.label}{arrow(c.key)}</button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.team}>
                    {COLUMNS.map((c) => {
                      const raw = r[c.key]
                      const val = c.fmt ? c.fmt(raw) : raw
                      return (
                        <td key={c.key} className="tnum" style={{ textAlign: c.align }}>
                          {c.key === 'team' ? (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
                              <TeamAvatar name={r.team} size={22} />
                              <TeamLink name={r.team} />
                            </span>
                          ) : c.key === 'championships' && raw > 0 ? (
                            <span style={{ color: 'var(--iff-gold)', fontWeight: 700 }}>{raw}</span>
                          ) : (
                            val
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DetailOverlay>
  )
}
