// TrophyHistoryCharts — Trophy Room sections computed from the imported ESPN
// game history (historyMatchups, 2008–2025): the rivalry grid, schedule luck,
// and the clutch factor. Lives beside TrophyAnalytics, which covers the
// standings-derived distributions; everything here needs game-level data.
import { useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { fantasyTeams, teamByName, isActiveTeam } from '../data/staticData'
import { headToHead, allPlayLuck, clutchFactor } from '../services/historyAnalytics'

const Label = ({ children }) => <div className="troom-section-label">{children}</div>

const Caption = ({ children }) => (
  <p style={{ fontSize: 11.5, color: 'var(--iff-subtext)', lineHeight: 1.55, margin: '0 0 10px', fontFamily: 'system-ui, sans-serif' }}>
    {children}
  </p>
)

function StatNote({ label, team, value, note }) {
  return (
    <div className="iff-card" style={{ padding: '10px 14px' }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--iff-subtext)', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 13.5, fontWeight: 800, marginTop: 3 }}>{team}</div>
      <div style={{ fontSize: 11.5, color: 'var(--iff-gold)', fontWeight: 700, marginTop: 1 }} className="tnum">{value}</div>
      {note && <div style={{ fontSize: 10.5, color: 'var(--iff-subtext)', marginTop: 2 }}>{note}</div>}
    </div>
  )}

/** Red (0%) → dim neutral (50%) → green (100%), for head-to-head cells. */
function pctColor(pct) {
  if (pct == null) return 'var(--iff-elevated)'
  const t = Math.abs(pct - 0.5) * 2 // 0 at even, 1 at total dominance
  const alpha = 0.12 + t * 0.75
  return pct >= 0.5 ? `rgba(74,222,128,${alpha})` : `rgba(248,113,113,${alpha})`
}

/**
 * A horizontal bar diverging from a center axis — positive grows right
 * (green), negative grows left (red). Used for luck and clutch.
 */
function DivergingRow({ label, value, maxAbs, format }) {
  const half = 50 // percent of track on each side of center
  const w = Math.min(Math.abs(value) / maxAbs, 1) * half
  const pos = value >= 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
      <span style={{ width: 66, flexShrink: 0, fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {label}
      </span>
      <div style={{ position: 'relative', flex: 1, height: 16, background: 'var(--iff-elevated)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.22)' }} />
        <div
          style={{
            position: 'absolute', top: 2, bottom: 2, borderRadius: 2,
            left: pos ? '50%' : `${half - w}%`,
            width: `${w}%`,
            background: pos ? 'rgba(74,222,128,0.75)' : 'rgba(248,113,113,0.75)',
          }}
        />
      </div>
      <span className="tnum" style={{ width: 44, flexShrink: 0, textAlign: 'right', fontSize: 10.5, fontWeight: 800, color: pos ? '#4ADE80' : '#F87171' }}>
        {format(value)}
      </span>
    </div>
  )
}

export default function TrophyHistoryCharts({ showFormer }) {
  const { historyMatchups } = useApp()

  const activeNames = useMemo(() => fantasyTeams.map((t) => t.name), [])

  const h2h = useMemo(() => headToHead(historyMatchups, activeNames), [historyMatchups, activeNames])
  const luck = useMemo(() => allPlayLuck(historyMatchups), [historyMatchups])
  const clutch = useMemo(() => clutchFactor(historyMatchups), [historyMatchups])

  // Former members can hold luck/clutch career rows; the room-wide toggle governs.
  const luckCareer = useMemo(
    () => luck.career.filter((r) => showFormer || isActiveTeam(r.team)),
    [luck.career, showFormer],
  )
  const clutchRows = useMemo(
    () => clutch.filter((r) => showFormer || isActiveTeam(r.team)),
    [clutch, showFormer],
  )
  const luckSeasons = useMemo(
    () => luck.seasons.filter((r) => showFormer || isActiveTeam(r.team)),
    [luck.seasons, showFormer],
  )

  if (historyMatchups.length === 0) return null

  // Rivalry callouts: most lopsided series (min 8 meetings) and most-played series.
  const pairs = []
  for (const a of h2h.teams) {
    for (const b of h2h.teams) {
      if (a >= b) continue
      const c = h2h.grid[a]?.[b]
      if (c?.games) pairs.push({ a, b, ...c })
    }
  }
  const lopsided = pairs
    .filter((p) => p.games >= 8)
    .sort((x, y) => Math.max(y.pct, 1 - y.pct) - Math.max(x.pct, 1 - x.pct) || y.games - x.games)[0]
  const mostPlayed = [...pairs].sort((x, y) => y.games - x.games)[0]
  const seriesLine = (p) => {
    const [winner, w, l, t] = p.pct >= 0.5 ? [p.a, p.w, p.l, p.t] : [p.b, p.l, p.w, p.t]
    const loser = winner === p.a ? p.b : p.a
    return { winner, loser, text: `${w}–${l}${t ? `–${t}` : ''} vs ${loser}` }
  }

  const luckMax = Math.max(0.1, ...luckCareer.map((r) => Math.abs(r.luck)))
  const clutchMax = Math.max(0.1, ...clutchRows.map((r) => Math.abs(r.delta)))
  const signed = (n, digits = 1) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(digits)}`
  const unluckiest = luckSeasons[0]
  const luckiest = luckSeasons[luckSeasons.length - 1]

  return (
    <>
      {/* ── Rivalry grid ── */}
      {h2h.teams.length > 1 && (
        <section>
          <Label>RIVALRY DOMINANCE</Label>
          <Caption>
            Every meeting since 2008, playoffs included — read a row to see who that owner
            beats. Green means the row owns the column; red means they&apos;d rather not
            talk about it. Hover any cell for the series score.
          </Caption>
          <div className="iff-card" style={{ padding: '12px 12px 10px', overflowX: 'auto' }}>
            <div style={{ minWidth: h2h.teams.length * 30 + 78 }}>
              <div style={{ display: 'flex', gap: 2, marginBottom: 3 }}>
                <span style={{ width: 66, flexShrink: 0 }} />
                {h2h.teams.map((t) => (
                  <span key={t} style={{ width: 28, fontSize: 8, color: 'var(--iff-subtext)', textAlign: 'center', fontWeight: 800, textTransform: 'uppercase' }}>
                    {teamByName[t]?.abbrev ?? t.slice(0, 4)}
                  </span>
                ))}
              </div>
              {h2h.teams.map((row) => (
                <div key={row} style={{ display: 'flex', alignItems: 'center', gap: 2, marginBottom: 2 }}>
                  <span style={{ width: 66, flexShrink: 0, fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {row}
                  </span>
                  {h2h.teams.map((colTeam) => {
                    const c = row === colTeam ? null : h2h.grid[row]?.[colTeam]
                    return (
                      <span
                        key={colTeam}
                        title={
                          row === colTeam
                            ? row
                            : c
                              ? `${row} vs ${colTeam}: ${c.w}–${c.l}${c.t ? `–${c.t}` : ''}`
                              : `${row} and ${colTeam} have never met`
                        }
                        className="tnum"
                        style={{
                          width: 28, height: 20, borderRadius: 3,
                          background: row === colTeam ? 'transparent' : pctColor(c?.pct ?? null),
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 8.5, fontWeight: 800,
                          color: c && Math.abs(c.pct - 0.5) > 0.28 ? '#0A0D1A' : 'rgba(255,255,255,0.75)',
                        }}
                      >
                        {c ? `${c.w}-${c.l}` : ''}
                      </span>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
          {lopsided && mostPlayed && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginTop: 10 }}>
              <StatNote
                label="MOST LOPSIDED SERIES"
                team={seriesLine(lopsided).winner}
                value={seriesLine(lopsided).text}
                note="min. 8 meetings"
              />
              <StatNote
                label="MOST-PLAYED RIVALRY"
                team={`${mostPlayed.a} · ${mostPlayed.b}`}
                value={`${mostPlayed.games} meetings`}
                note={`${seriesLine(mostPlayed).winner} leads ${seriesLine(mostPlayed).text.split(' vs ')[0]}`}
              />
            </div>
          )}
        </section>
      )}

      {/* ── Schedule luck ── */}
      {luckCareer.length > 0 && (
        <section>
          <Label>SCHEDULE LUCK</Label>
          <Caption>
            Career wins above or below what the scoreboard earned. Each week every team is
            scored against the whole league (the all-play record); the bar is real wins minus
            that. Green got carried by soft schedules — red got robbed by them.
          </Caption>
          <div className="iff-card" style={{ padding: '10px 12px' }}>
            {[...luckCareer].sort((a, b) => b.luck - a.luck).map((r) => (
              <DivergingRow key={r.team} label={r.team} value={r.luck} maxAbs={luckMax} format={(v) => signed(v)} />
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: 'var(--iff-subtext)', padding: '4px 6px 0' }}>
              <span>robbed</span>
              <span>carried</span>
            </div>
          </div>
          {unluckiest && luckiest && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginTop: 10 }}>
              <StatNote
                label="UNLUCKIEST SEASON EVER"
                team={`${unluckiest.team} · ${unluckiest.season}`}
                value={`${signed(unluckiest.luck, 2)} wins`}
                note={`${unluckiest.actualWins} real wins, ${unluckiest.expectedWins.toFixed(2)} deserved`}
              />
              <StatNote
                label="LUCKIEST SEASON EVER"
                team={`${luckiest.team} · ${luckiest.season}`}
                value={`${signed(luckiest.luck, 2)} wins`}
                note={`${luckiest.actualWins} real wins, ${luckiest.expectedWins.toFixed(2)} deserved`}
              />
            </div>
          )}
        </section>
      )}

      {/* ── Clutch factor ── */}
      {clutchRows.length > 0 && (
        <section>
          <Label>CLUTCH FACTOR</Label>
          <Caption>
            Postseason points per game minus regular-season points per game. Everyone plays
            the playoff weeks (winners and consolation brackets alike), so this is who shows
            up after the schedule stops being polite.
          </Caption>
          <div className="iff-card" style={{ padding: '10px 12px' }}>
            {clutchRows.map((r) => (
              <DivergingRow key={r.team} label={r.team} value={r.delta} maxAbs={clutchMax} format={(v) => signed(v)} />
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: 'var(--iff-subtext)', padding: '4px 6px 0' }}>
              <span>folds in December</span>
              <span>shows up in December</span>
            </div>
          </div>
        </section>
      )}
    </>
  )
}
