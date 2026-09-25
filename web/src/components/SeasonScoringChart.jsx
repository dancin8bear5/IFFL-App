// SeasonScoringChart — the in-season Dashboard module. Only mounts when
// the commissioner has turned off Off-Season Mode.
//
// Two forms, two different jobs:
//
//   1. Your season, week by week — CHANGE OVER TIME, so a line. The
//      league's low-to-high spread each week rides underneath as a band,
//      which is what turns "you scored 112" into "you scored 112 in a
//      week where the league topped out at 118." Median is a dashed
//      neutral reference, not a competing series.
//
//   2. The latest week — MAGNITUDE across 12 named teams, so a ranked
//      horizontal bar (vertical columns would turn the names sideways).
//
// Color: exactly ONE identity hue on screen — your team, in the app's
// gold. Everything else is a neutral, because bar length and line height
// already encode the values and spending the identity channel to
// re-encode them would be redundant. Twelve categorical hues would be
// wrong here regardless: the ceiling is eight, and the ninth series is
// never a generated hue.
//
// Validated against the card surface (#141827): gold vs the neutral bar
// clears CVD ΔE 26.3 (protan) / 31.3 (tritan) and 32.0 normal-vision,
// with both marks over 3:1 contrast. The neutral #5A6688 is the LOWEST
// step that still clears 3:1, so it stays recessive without going
// illegible.
//
// Colors come from CSS custom properties rather than the raw hex above,
// because the app ships alternate themes (90s, the decade skins, Bears)
// that remap those tokens — a hardcoded hex would survive validation and
// then break in eight other skins.
//
// Deliberately absent: all-play and True Record. Those are the POD's
// reveal (services/trueRecord.js, POD tab only). This module shows only
// what every manager can already read off the ESPN scoreboard.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../context/AppContext'
import { weeksFromMap, computeSeasonScoring, latestWeek } from '../services/weeklyStats'
import { TeamAvatar } from './shared'
import TeamLink from './TeamLink'

const NEUTRAL_BAR = '#5A6688'   // lowest step clearing 3:1 on #141827

const fmt1 = (n) => (Number.isFinite(n) ? n.toFixed(1) : '—')
const ord = (n) => {
  if (!Number.isFinite(n)) return '—'
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

export default function SeasonScoringChart() {
  const { weeklyScores, userTeam, activeSeason } = useApp()

  const weeks = useMemo(() => weeksFromMap(weeklyScores), [weeklyScores])
  const season = useMemo(() => computeSeasonScoring(weeks, userTeam), [weeks, userTeam])
  const week = useMemo(() => latestWeek(weeks), [weeks])

  if (weeks.length === 0) {
    return (
      <div className="iff-card empty-state" style={{ padding: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>📈 In-Season Scoring</div>
        <div style={{ fontSize: 11.5, color: 'var(--iff-subtext)', lineHeight: 1.6 }}>
          No weeks entered for {activeSeason} yet. Scores get added each week in the POD tab
          and show up here for the whole league.
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <StatRow season={season} userTeam={userTeam} />
      <SeasonLine season={season} userTeam={userTeam} />
      {week && <LatestWeekBars week={week} userTeam={userTeam} />}
    </div>
  )
}

// ── Stat tiles ─────────────────────────────────────────────────
// A hero number beats a chart when there's one value to read. Rank
// carries the "of 12" denominator inline so it isn't a bare number.

function StatRow({ season, userTeam }) {
  const tiles = userTeam
    ? [
        { label: 'Your Avg', value: fmt1(season.avgPPG), sub: `${ord(season.rank)} of ${season.teamCount}` },
        { label: 'Best Week', value: fmt1(season.best?.points), sub: season.best ? `Week ${season.best.week}` : '—' },
        { label: 'Worst Week', value: fmt1(season.worst?.points), sub: season.worst ? `Week ${season.worst.week}` : '—' },
        { label: 'League Avg', value: fmt1(season.leagueAvg), sub: `${season.weekCount} week${season.weekCount === 1 ? '' : 's'}` },
      ]
    : [
        { label: 'League Avg', value: fmt1(season.leagueAvg), sub: `${season.weekCount} week${season.weekCount === 1 ? '' : 's'}` },
        { label: 'Teams', value: String(season.teamCount), sub: 'scoring' },
      ]

  return (
    <div className="iff-card" style={{ padding: '12px 14px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${tiles.length}, 1fr)`, gap: 8, textAlign: 'center' }}>
        {tiles.map((t) => (
          <div key={t.label}>
            <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: -0.4 }}>{t.value}</div>
            <div style={{ fontSize: 10, color: 'var(--iff-subtext)', marginTop: 1 }}>{t.label}</div>
            <div style={{ fontSize: 9.5, color: 'var(--iff-subtext)', opacity: 0.7 }}>{t.sub}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Your season, week by week ──────────────────────────────────

const PAD = { top: 14, right: 16, bottom: 24, left: 34 }

/**
 * Width of the element, tracked live.
 *
 * The chart sets its viewBox to the MEASURED pixel width so one viewBox
 * unit is one CSS pixel. A fixed viewBox would have been simpler, but it
 * scales the whole drawing to fit the container — including the text.
 * At 390px a 640-unit viewBox shrinks 9px axis labels to about 5px, which
 * is unreadable on the exact device most of the league uses.
 */
function useMeasuredWidth(ref, fallback = 640) {
  const [w, setW] = useState(fallback)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => {
      setW(Math.max(240, Math.round(entry.contentRect.width)))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return w
}

function SeasonLine({ season, userTeam }) {
  const [hover, setHover] = useState(null)
  const wrapRef = useRef(null)
  const W = useMeasuredWidth(wrapRef)
  const H = W < 420 ? 168 : 200
  const pts = season.points

  // Scale to the league's full spread, not just the viewer's line, so a
  // team never appears to be scoring near the top of the chart when it's
  // actually near the bottom of the league.
  const values = pts.flatMap((p) => [p.mine, p.high, p.low].filter(Number.isFinite))
  if (values.length === 0) return null
  const rawMin = Math.min(...values)
  const rawMax = Math.max(...values)
  const pad = Math.max(5, (rawMax - rawMin) * 0.12)
  const yMin = Math.max(0, rawMin - pad)
  const yMax = rawMax + pad

  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  // A single week has no width to divide — pin it to the middle rather
  // than dividing by zero.
  const x = (i) => (pts.length === 1 ? PAD.left + plotW / 2 : PAD.left + (i / (pts.length - 1)) * plotW)
  const y = (v) => PAD.top + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH

  // Band + median only span weeks that actually have league context.
  const ctx = pts.map((p, i) => ({ ...p, i })).filter((p) => p.high !== null)
  const bandPath = ctx.length >= 2
    ? `M ${ctx.map((p) => `${x(p.i)},${y(p.high)}`).join(' L ')} L ${[...ctx].reverse().map((p) => `${x(p.i)},${y(p.low)}`).join(' L ')} Z`
    : null
  const medianPath = ctx.length >= 2 ? `M ${ctx.map((p) => `${x(p.i)},${y(p.median)}`).join(' L ')}` : null

  // The viewer's line breaks across weeks they have no score for, rather
  // than drawing a straight line through the gap as if they'd played.
  const mineSegments = []
  let run = []
  pts.forEach((p, i) => {
    if (p.mine === null) { if (run.length > 0) mineSegments.push(run); run = [] }
    else run.push({ x: x(i), y: y(p.mine), i })
  })
  if (run.length > 0) mineSegments.push(run)

  const active = hover === null ? null : pts[hover]
  const yTicks = [yMin, (yMin + yMax) / 2, yMax]

  return (
    <div className="iff-card" style={{ padding: '14px 16px 10px', position: 'relative' }}>
      <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: -0.2 }}>
        {userTeam ? 'Your Season' : 'League Scoring'}
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--iff-subtext)', marginTop: 2, marginBottom: 6 }}>
        Points by week · shaded band is the league&apos;s low-to-high range
      </div>

      <div ref={wrapRef}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }} role="img"
        aria-label={`Weekly points${userTeam ? ` for ${userTeam}` : ''} against the league range`}>
        {/* Recessive gridlines — behind everything, no axis box */}
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--iff-divider)" strokeWidth="1" />
            <text x={PAD.left - 6} y={y(v) + 3.5} textAnchor="end" fontSize="9" fill="var(--iff-subtext)">{Math.round(v)}</text>
          </g>
        ))}

        {bandPath && <path d={bandPath} fill={NEUTRAL_BAR} opacity="0.22" />}
        {medianPath && (
          <path d={medianPath} fill="none" stroke={NEUTRAL_BAR} strokeWidth="2" strokeDasharray="5 4" strokeLinecap="round" />
        )}

        {mineSegments.map((seg, si) => (
          <path key={si} d={`M ${seg.map((p) => `${p.x},${p.y}`).join(' L ')}`}
            fill="none" stroke="var(--iff-gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {/* 2px surface ring keeps markers legible where the line crosses the band */}
        {mineSegments.flat().map((p) => (
          <circle key={p.i} cx={p.x} cy={p.y} r="4" fill="var(--iff-gold)" stroke="var(--iff-surface)" strokeWidth="2" />
        ))}

        {/* Week labels — thinned so they never collide on a long season */}
        {pts.map((p, i) => {
          const step = Math.ceil(pts.length / 8)
          if (i % step !== 0 && i !== pts.length - 1) return null
          return (
            <text key={p.week} x={x(i)} y={H - 8} textAnchor="middle" fontSize="9" fill="var(--iff-subtext)">
              {p.week}
            </text>
          )
        })}

        {/* Crosshair for the hovered week */}
        {active && (
          <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH}
            stroke="var(--iff-subtext)" strokeWidth="1" opacity="0.5" />
        )}

        {/* Hit targets are full-height columns — far bigger than the marks */}
        {pts.map((p, i) => (
          <rect key={`hit-${p.week}`}
            x={x(i) - (plotW / Math.max(1, pts.length)) / 2} y={PAD.top}
            width={plotW / Math.max(1, pts.length)} height={plotH}
            fill="transparent" style={{ cursor: 'pointer' }}
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
        ))}
      </svg>
      </div>

      {/* Legend — always present for 2+ marks, so identity is never color alone */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 6, fontSize: 10, color: 'var(--iff-subtext)' }}>
        {userTeam && <LegendKey swatch={<span style={{ width: 14, height: 2.5, background: 'var(--iff-gold)', borderRadius: 2 }} />} label={userTeam} />}
        <LegendKey swatch={<span style={{ width: 14, height: 2.5, background: NEUTRAL_BAR, borderRadius: 2, opacity: 0.9 }} />} label="League median" />
        <LegendKey swatch={<span style={{ width: 14, height: 8, background: NEUTRAL_BAR, opacity: 0.22, borderRadius: 2 }} />} label="League range" />
      </div>

      {active && (
        <div style={{
          position: 'absolute', top: 8,
          // Flip to the left half once the crosshair is past the middle,
          // so the tooltip never sits on top of the week it describes.
          ...(hover > (pts.length - 1) / 2 ? { left: 12 } : { right: 12 }),
          background: 'var(--iff-elevated)',
          border: '1px solid var(--iff-divider)', borderRadius: 8, padding: '7px 10px',
          fontSize: 11, pointerEvents: 'none', minWidth: 118, zIndex: 2,
        }}>
          <div style={{ fontWeight: 800, marginBottom: 3 }}>Week {active.week}</div>
          {userTeam && (
            <Row label={userTeam} value={active.mine === null ? 'no score' : fmt1(active.mine)} strong />
          )}
          <Row label="High" value={fmt1(active.high)} />
          <Row label="Median" value={fmt1(active.median)} />
          <Row label="Low" value={fmt1(active.low)} />
        </div>
      )}
    </div>
  )
}

const LegendKey = ({ swatch, label }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>{swatch}{label}</span>
)

const Row = ({ label, value, strong }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, color: 'var(--iff-subtext)' }}>
    <span>{label}</span>
    <span style={{ fontWeight: strong ? 800 : 600, color: strong ? 'var(--iff-text)' : 'inherit' }}>{value}</span>
  </div>
)

// ── Latest week ────────────────────────────────────────────────

function LatestWeekBars({ week, userTeam }) {
  const [hover, setHover] = useState(null)
  const max = Math.max(1, ...week.rows.map((r) => r.points))

  return (
    <div className="iff-card" style={{ padding: '14px 16px 12px' }}>
      <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: -0.2 }}>Week {week.week}</div>
      <div style={{ fontSize: 10.5, color: 'var(--iff-subtext)', marginTop: 2, marginBottom: 10 }}>
        Every team, highest first
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {week.rows.map((r) => {
          const isMine = r.teamName === userTeam
          return (
            <div
              key={r.teamName}
              onMouseEnter={() => setHover(r.teamName)}
              onMouseLeave={() => setHover(null)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                // Every bar is already direct-labelled with rank, name and
                // exact score, so a tooltip would only repeat what's on
                // screen. Hover just confirms the row you're pointing at.
                background: hover === r.teamName ? 'var(--iff-elevated)' : 'transparent',
                borderRadius: 6, margin: '0 -6px', padding: '1px 6px',
                transition: 'background 0.12s',
              }}
            >
              <span style={{ width: 16, fontSize: 10, color: 'var(--iff-subtext)', textAlign: 'right', flexShrink: 0 }}>
                {r.rank}
              </span>
              <TeamAvatar name={r.teamName} size={18} />
              <span style={{
                width: 68, fontSize: 11, fontWeight: isMine ? 800 : 600, flexShrink: 0,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                <TeamLink name={r.teamName} />
              </span>
              <span style={{ flex: 1, minWidth: 0, height: 13, position: 'relative' }}>
                <span style={{
                  display: 'block', height: '100%',
                  width: `${Math.max(2, (r.points / max) * 100)}%`,
                  background: isMine ? 'var(--iff-gold)' : NEUTRAL_BAR,
                  // Rounded data-end only; the baseline end stays square
                  borderRadius: '2px 4px 4px 2px',
                }} />
              </span>
              {/* Direct-labelled, which is what lets this chart skip an axis
                  entirely. Label wears text tokens, never the bar color. */}
              <span style={{ width: 42, fontSize: 11, fontWeight: isMine ? 800 : 600, textAlign: 'right', flexShrink: 0 }}>
                {fmt1(r.points)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
