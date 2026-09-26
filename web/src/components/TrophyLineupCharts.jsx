// TrophyLineupCharts — the two Trophy Room sections built from weekly player
// lines: bench regret (what a perfect lineup would have been worth) and roster
// DNA (which positions a franchise actually leans on).
//
// Both cover 2018 onward only — ESPN kept no weekly player data before then,
// and the section says so rather than quietly reporting a partial history as
// if it were all of it.
import { useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { teamByName, isActiveTeam } from '../data/staticData'
import { regretLeaderboard, rosterDNA, DNA_POSITIONS } from '../services/lineupOptimizer'

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
  )
}

const POS_COLOR = {
  QB: '#E63946', RB: '#F4A261', WR: '#4ADE80', TE: '#60A5FA', 'D/ST': '#A78BFA', K: '#94A3B8', Other: '#475569',
}

export default function TrophyLineupCharts({ showFormer }) {
  const { historyAggregates } = useApp()
  const lineups = historyAggregates?.lineups

  const include = useMemo(
    () => (showFormer ? () => true : (t) => isActiveTeam(t)),
    [showFormer],
  )

  const board = useMemo(() => regretLeaderboard(lineups?.rows, include), [lineups, include])
  const dna = useMemo(() => rosterDNA(lineups?.positionShare, include), [lineups, include])

  if (!lineups || board.length === 0) return null

  const since = lineups.sinceSeason ?? 2018
  const regretMax = Math.max(1, ...board.map((r) => r.regret))
  const totalFlipped = board.reduce((a, r) => a + r.flippedLosses, 0)
  // The board is sorted by TOTAL regret, which is a different question from
  // who lost the most winnable games — in the real data those are two
  // different managers, so this card has to sort for itself.
  const mostFlipped = [...board].sort((a, b) => b.flippedLosses - a.flippedLosses)[0]
  const worstWeek = (lineups.rows ?? [])
    .filter((r) => include(r.team))
    .reduce((a, b) => ((b?.regret ?? 0) > (a?.regret ?? 0) ? b : a), null)

  // DNA callouts: who leans hardest on each position.
  const leader = (pos) => [...dna].sort((a, b) => b.shares[pos] - a.shares[pos])[0]
  const wrLeader = leader('WR')
  const rbLeader = leader('RB')

  return (
    <>
      {/* ── Bench regret ── */}
      <section>
        <Label>BENCH REGRET</Label>
        <Caption>
          Points left on the bench, career — the gap between what a manager started and the
          best lineup those same players could have made that week. Injured-reserve players
          are never counted: you can&apos;t start who you can&apos;t start. Weekly player data
          begins in {since}, so this is the {since}-onward era only.
        </Caption>
        <div className="iff-card" style={{ padding: '10px 12px' }}>
          {board.map((r) => (
            <div key={r.team} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <span style={{ width: 66, flexShrink: 0, fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {r.team}
              </span>
              <div style={{ flex: 1, height: 16, background: 'var(--iff-elevated)', borderRadius: 3, overflow: 'hidden' }}>
                <div
                  title={`${r.team}: ${Math.round(r.regret)} points left behind across ${r.weeks} weeks (${r.perWeek.toFixed(1)}/wk) · ${r.flippedLosses} losses a perfect lineup would have won`}
                  style={{
                    width: `${(r.regret / regretMax) * 100}%`, height: '100%',
                    background: teamByName[r.team]?.color ?? 'var(--iff-accent)', opacity: 0.85,
                  }}
                />
              </div>
              <span className="tnum" style={{ width: 48, flexShrink: 0, textAlign: 'right', fontSize: 10.5, fontWeight: 800, color: '#F87171' }}>
                {r.perWeek.toFixed(1)}
              </span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: 'var(--iff-subtext)', padding: '4px 6px 0' }}>
            <span>bar: career points left behind</span>
            <span>per week</span>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginTop: 10 }}>
          {worstWeek && (
            <StatNote
              label="WORST LINEUP DECISION"
              team={`${worstWeek.team} · ${worstWeek.season} wk ${worstWeek.week}`}
              value={`${Math.round(worstWeek.regret * 10) / 10} left behind`}
              note={`started ${worstWeek.started}, best was ${worstWeek.optimal}`}
            />
          )}
          <StatNote
            label="LOSSES A PERFECT LINEUP WINS"
            team={`${totalFlipped} games league-wide`}
            value={`${mostFlipped.team}: ${mostFlipped.flippedLosses}`}
            note={`most winnable games lost · since ${since}`}
          />
        </div>
      </section>

      {/* ── Roster DNA ── */}
      {dna.length > 0 && (
        <section>
          <Label>ROSTER DNA</Label>
          <Caption>
            Where each franchise&apos;s starting points actually come from. Bench points are
            excluded — this is what a manager put on the field and lived with. Since {since}.
          </Caption>
          <div className="iff-card" style={{ padding: '12px 12px 10px' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
              {[...DNA_POSITIONS, 'Other'].map((pos) => (
                <span key={pos} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9.5, color: 'var(--iff-subtext)', fontWeight: 700 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: POS_COLOR[pos] }} />
                  {pos}
                </span>
              ))}
            </div>
            {dna.map((row) => (
              <div key={row.team} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <span style={{ width: 66, flexShrink: 0, fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {row.team}
                </span>
                <div style={{ flex: 1, height: 16, display: 'flex', borderRadius: 3, overflow: 'hidden' }}>
                  {[...DNA_POSITIONS, 'Other'].map((pos) => {
                    const share = row.shares[pos] ?? 0
                    if (share <= 0) return null
                    return (
                      <div
                        key={pos}
                        title={`${row.team} — ${pos}: ${(share * 100).toFixed(1)}% of starter points`}
                        style={{ width: `${share * 100}%`, background: POS_COLOR[pos] }}
                      />
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          {wrLeader && rbLeader && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginTop: 10 }}>
              <StatNote
                label="MOST WR-DEPENDENT"
                team={wrLeader.team}
                value={`${(wrLeader.shares.WR * 100).toFixed(1)}% from WR`}
                note="share of starter points"
              />
              <StatNote
                label="MOST RB-DEPENDENT"
                team={rbLeader.team}
                value={`${(rbLeader.shares.RB * 100).toFixed(1)}% from RB`}
                note="share of starter points"
              />
            </div>
          )}
        </section>
      )}
    </>
  )
}
