// TrophyDraftCharts — Trophy Room sections built from the precomputed history
// aggregates: how a franchise scored against its own era, where the league's
// auction money goes, and which owner turns dollars into points.
//
// Reads historyAggregates/{scoring,draft} through AppContext rather than the
// raw season docs — see services/draftAnalytics.js for why.
import { useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { teamByName, isActiveTeam } from '../data/staticData'
import { scoringEras, positionSpendShare, draftROI, SPEND_POSITIONS } from '../services/draftAnalytics'

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

// Position bands, warm→cool so the stack reads as a draft board.
const POS_COLOR = {
  QB: '#E63946', RB: '#F4A261', WR: '#4ADE80', TE: '#60A5FA', 'D/ST': '#A78BFA', K: '#94A3B8', Other: '#475569',
}

/**
 * Small-multiple sparkline of one team's points-per-game against the league
 * average of the same season. The zero line is the era; the area shows how
 * far above or below it that franchise lived.
 */
function EraSpark({ row, seasons, maxAbs, width = 132, height = 34 }) {
  const bySeason = new Map(row.points.map((p) => [p.season, p]))
  const pad = 2
  const usable = height - pad * 2
  const x = (i) => (seasons.length <= 1 ? width / 2 : (i / (seasons.length - 1)) * (width - 6) + 3)
  const y = (v) => pad + usable / 2 - (v / maxAbs) * (usable / 2)

  const pts = seasons
    .map((s, i) => ({ i, p: bySeason.get(s.season) }))
    .filter((d) => d.p)
    .map((d) => ({ x: x(d.i), y: y(d.p.vsAvg), p: d.p }))

  const color = teamByName[row.team]?.color ?? 'var(--iff-accent)'

  return (
    <svg width={width} height={height} style={{ display: 'block', overflow: 'visible' }} role="img"
      aria-label={`${row.team} points per game versus league average, ${seasons[0]?.season}–${seasons[seasons.length - 1]?.season}`}>
      <line x1={0} x2={width} y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,0.18)" strokeWidth="1" strokeDasharray="2 2" />
      {pts.length > 1 && (
        <polyline
          points={pts.map((d) => `${d.x},${d.y}`).join(' ')}
          fill="none" stroke={color} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round"
        />
      )}
      {pts.map((d) => (
        <circle key={d.p.season} cx={d.x} cy={d.y} r={1.9} fill={color}>
          <title>{`${row.team} — ${d.p.season}: ${d.p.ppg} PPG (${d.p.vsAvg >= 0 ? '+' : '−'}${Math.abs(d.p.vsAvg).toFixed(1)} vs league)`}</title>
        </circle>
      ))}
    </svg>
  )
}

export default function TrophyDraftCharts({ showFormer }) {
  const { historyAggregates } = useApp()
  const include = useMemo(
    () => (showFormer ? () => true : (t) => isActiveTeam(t)),
    [showFormer],
  )

  const eras = useMemo(
    () => scoringEras(historyAggregates?.scoring, include),
    [historyAggregates, include],
  )
  const spend = useMemo(() => positionSpendShare(historyAggregates?.draft), [historyAggregates])
  const roi = useMemo(() => draftROI(historyAggregates?.draft, include), [historyAggregates, include])

  if (!historyAggregates) return null

  const signed = (n, d = 1) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(d)}`
  const maxAbs = Math.max(
    5,
    ...eras.teams.flatMap((t) => t.points.map((p) => Math.abs(p.vsAvg))),
  )

  // League scoring drift, first season to last.
  const firstSeason = eras.seasons[0]
  const lastSeason = eras.seasons[eras.seasons.length - 1]
  const peak = [...eras.seasons].sort((a, b) => b.leagueAvgPPG - a.leagueAvgPPG)[0]

  const roiMax = Math.max(0.1, ...roi.career.map((r) => r.ptsPerDollar))

  // Spend-share callouts: the position that gained and lost the most share.
  let spendShift = null
  if (spend.length > 1) {
    const a = spend[0]
    const b = spend[spend.length - 1]
    const deltas = [...SPEND_POSITIONS, 'Other'].map((pos) => ({ pos, delta: (b.shares[pos] ?? 0) - (a.shares[pos] ?? 0) }))
    const up = [...deltas].sort((x, y) => y.delta - x.delta)[0]
    const down = [...deltas].sort((x, y) => x.delta - y.delta)[0]
    spendShift = { from: a.season, to: b.season, up, down, first: a, last: b }
  }

  return (
    <>
      {/* ── Franchise scoring eras ── */}
      {eras.teams.length > 0 && eras.seasons.length > 1 && (
        <section>
          <Label>SCORING ERAS</Label>
          <Caption>
            Each franchise&apos;s points per game measured against the league average of that
            same season — the dashed line. Raw totals lie across eras: the league averaged{' '}
            <b className="tnum">{peak.leagueAvgPPG}</b> a game in {peak.season} and{' '}
            <b className="tnum">{lastSeason.leagueAvgPPG}</b> in {lastSeason.season}, so a good
            number then is an ordinary one now.
          </Caption>
          <div className="iff-card" style={{ padding: '12px 12px 10px' }}>
            {/* Track has to clear the row's real width (62 label + 132 spark +
                40 value + gaps) or the value overruns the next team's name. */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(262px, 1fr))', gap: '10px 20px' }}>
              {eras.teams.map((row) => (
                <div key={row.team} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 62, flexShrink: 0, fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {row.team}
                  </span>
                  <EraSpark row={row} seasons={eras.seasons} maxAbs={maxAbs} />
                  <span
                    className="tnum"
                    style={{ width: 40, flexShrink: 0, textAlign: 'right', fontSize: 10.5, fontWeight: 800, color: row.best.vsAvg >= 0 ? '#4ADE80' : '#F87171' }}
                    title={`Best season vs league average: ${row.best.season}`}
                  >
                    {signed(row.best.vsAvg)}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 9.5, color: 'var(--iff-subtext)', padding: '8px 2px 0' }}>
              {firstSeason.season}–{lastSeason.season} · the number is that franchise&apos;s best season vs its era
            </div>
          </div>
          {eras.bestEver && eras.worstEver && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginTop: 10 }}>
              <StatNote
                label="MOST DOMINANT OFFENSE"
                team={`${eras.bestEver.team} · ${eras.bestEver.season}`}
                value={`${signed(eras.bestEver.vsAvg)} vs league`}
                note={`${eras.bestEver.ppg} points a game`}
              />
              <StatNote
                label="LEAST DANGEROUS OFFENSE"
                team={`${eras.worstEver.team} · ${eras.worstEver.season}`}
                value={`${signed(eras.worstEver.vsAvg)} vs league`}
                note={`${eras.worstEver.ppg} points a game`}
              />
            </div>
          )}
        </section>
      )}

      {/* ── Where the money goes ── */}
      {spend.length > 1 && (
        <section>
          <Label>WHERE THE MONEY GOES</Label>
          <Caption>
            Every auction dollar the league has spent, split by position. One column per
            draft — the bands show what the room believed a position was worth that year.
          </Caption>
          <div className="iff-card" style={{ padding: '12px 12px 10px', overflowX: 'auto' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
              {[...SPEND_POSITIONS, 'Other'].map((pos) => (
                <span key={pos} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9.5, color: 'var(--iff-subtext)', fontWeight: 700 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: POS_COLOR[pos] }} />
                  {pos}
                </span>
              ))}
            </div>
            {/* Columns cap their width so a short history (or the preview
                fixture's five drafts) doesn't render as giant slabs. */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, minWidth: spend.length * 26 }}>
              {spend.map((s) => (
                <div key={s.season} style={{ flex: 1, minWidth: 22, maxWidth: 54 }}>
                  <div style={{ height: 128, display: 'flex', flexDirection: 'column', borderRadius: 3, overflow: 'hidden' }}>
                    {[...SPEND_POSITIONS, 'Other'].map((pos) => {
                      const share = s.shares[pos] ?? 0
                      if (share <= 0) return null
                      return (
                        <div
                          key={pos}
                          title={`${s.season} — ${pos}: ${(share * 100).toFixed(1)}% of $${Math.round(s.total)}`}
                          style={{ height: `${share * 100}%`, background: POS_COLOR[pos] }}
                        />
                      )
                    })}
                  </div>
                  <div className="tnum" style={{ fontSize: 8.5, color: 'var(--iff-subtext)', textAlign: 'center', fontWeight: 700, marginTop: 3 }}>
                    {String(s.season).slice(2)}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {spendShift && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginTop: 10 }}>
              <StatNote
                label="BIGGEST RISER"
                team={spendShift.up.pos}
                value={`${(spendShift.first.shares[spendShift.up.pos] * 100).toFixed(1)}% → ${(spendShift.last.shares[spendShift.up.pos] * 100).toFixed(1)}%`}
                note={`share of the auction, ${spendShift.from} → ${spendShift.to}`}
              />
              <StatNote
                label="BIGGEST FALLER"
                team={spendShift.down.pos}
                value={`${(spendShift.first.shares[spendShift.down.pos] * 100).toFixed(1)}% → ${(spendShift.last.shares[spendShift.down.pos] * 100).toFixed(1)}%`}
                note={`share of the auction, ${spendShift.from} → ${spendShift.to}`}
              />
            </div>
          )}
        </section>
      )}

      {/* ── Draft ROI ── */}
      {roi.career.length > 0 && (
        <section>
          <Label>DRAFT RETURN</Label>
          <Caption>
            Fantasy points produced per auction dollar, career. A pick who scored nothing for
            you still counts — that dollar bought nothing, and this is the chart that says so.
          </Caption>
          <div className="iff-card" style={{ padding: '10px 12px' }}>
            {roi.career.map((r) => (
              <div key={r.team} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <span style={{ width: 66, flexShrink: 0, fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.team}
                </span>
                <div style={{ flex: 1, height: 16, background: 'var(--iff-elevated)', borderRadius: 3, overflow: 'hidden' }}>
                  <div
                    title={`${r.team}: $${Math.round(r.spend)} spent, ${Math.round(r.points)} points, across ${r.seasons} drafts`}
                    style={{
                      width: `${(r.ptsPerDollar / roiMax) * 100}%`, height: '100%',
                      background: teamByName[r.team]?.color ?? 'var(--iff-accent)', opacity: 0.85,
                    }}
                  />
                </div>
                <span className="tnum" style={{ width: 44, flexShrink: 0, textAlign: 'right', fontSize: 10.5, fontWeight: 800, color: 'var(--iff-gold)' }}>
                  {r.ptsPerDollar.toFixed(1)}
                </span>
              </div>
            ))}
            <div style={{ fontSize: 9.5, color: 'var(--iff-subtext)', padding: '4px 6px 0' }}>
              points per auction dollar
            </div>
          </div>
          {roi.bestClass && roi.worstClass && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginTop: 10 }}>
              <StatNote
                label="BEST DRAFT CLASS"
                team={`${roi.bestClass.team} · ${roi.bestClass.season}`}
                value={`${roi.bestClass.ptsPerDollar.toFixed(1)} pts/$`}
                note={`$${Math.round(roi.bestClass.spend)} bought ${Math.round(roi.bestClass.points)} points`}
              />
              <StatNote
                label="WORST DRAFT CLASS"
                team={`${roi.worstClass.team} · ${roi.worstClass.season}`}
                value={`${roi.worstClass.ptsPerDollar.toFixed(1)} pts/$`}
                note={`$${Math.round(roi.worstClass.spend)} bought ${Math.round(roi.worstClass.points)} points`}
              />
            </div>
          )}
        </section>
      )}
    </>
  )
}
