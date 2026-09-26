// TrophyAnalytics — the distribution half of the Trophy Room.
//
// The sections above it report peaks: most titles, best win pct, all-time
// points. These report SPREAD, because a career average hides whether a
// manager is reliably fourth or alternates first and twelfth.
//
// Three forms, each picked for the question it answers:
//
//   Finish range   — a dumbbell (best↔worst with the median marked). The
//                    right form for "what is this manager's floor and
//                    ceiling", which a bar chart of averages cannot show.
//   Finish grid    — a heatmap, team × season. The only form that fits ~200
//                    values on one screen, and the only one where dynasties
//                    and collapses are visible as shapes rather than read
//                    as numbers.
//   Money ranges   — dumbbells again, so the two money sections read as the
//                    same question asked twice (roster, then keepers).
//
// COLOR. The grid is SEQUENTIAL — one measure (finishing place) in ordered
// steps — so it takes one hue in monotone lightness, never a rainbow. The
// ramp below was validated against the card surface (#141827) on the dark
// band: monotone lightness, every adjacent gap over 0.06 ΔL, single hue
// (8° spread), dim end at 2.68:1 vs the surface. All four ordinal checks
// PASS. On a dark ground the ramp runs bright = better, because luminance
// is what the eye reads as "more".
//
// The dumbbells are not categorical: the two ends are the same measure, so
// they share one hue and are separated by position and by the median dot,
// never by two competing colors.
import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { fantasyTeams, KEEPER_PRICE_MAX } from '../data/staticData'
import { finishRanges, finishGrid, salaryRanges, keeperRanges } from '../services/trophyAnalytics'
import { TeamAvatar } from './shared'

// Validated sequential ramp, best → worst. See header.
const PLACE_RAMP = ['#C2E2F4', '#9FCDE6', '#7FB4D4', '#659BBE', '#4E80A4', '#3A6486']
const RANGE_FILL = '#4E80A4'
const MED_FILL = '#C68334'
const EMPTY_CELL = 'rgba(255,255,255,0.05)'

/** Ramp step for a finishing place, scaled to the deepest place on record. */
function placeColor(place, maxPlace) {
  if (place == null) return EMPTY_CELL
  const span = Math.max(1, maxPlace - 1)
  const t = Math.min(1, Math.max(0, (place - 1) / span))
  return PLACE_RAMP[Math.min(PLACE_RAMP.length - 1, Math.round(t * (PLACE_RAMP.length - 1)))]
}

const Label = ({ children }) => (
  <div className="troom-section-label">{children}</div>
)

const Caption = ({ children }) => (
  <div style={{ fontSize: 11, color: 'var(--iff-subtext)', lineHeight: 1.55, margin: '0 0 10px', fontFamily: 'system-ui, sans-serif' }}>
    {children}
  </div>
)

/* ═══════════ Dumbbell ═══════════ */
// One row: a track from `min` to `max` with a median dot. `scaleMax` is
// shared across all rows so the bars are comparable — a per-row scale would
// make every team look identical.
function Dumbbell({ label, sub, min, max, med, scaleMax, invert, format, hot, onHover }) {
  const pos = (v) => {
    const pct = (v / scaleMax) * 100
    return invert ? 100 - pct : pct
  }
  const a = pos(min)
  const b = pos(max)
  const left = Math.min(a, b)
  const width = Math.max(Math.abs(b - a), 1.2)

  return (
    <div
      onPointerEnter={onHover}
      onPointerLeave={() => onHover?.(null)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px',
        borderRadius: 7, background: hot ? 'rgba(255,255,255,0.045)' : 'transparent',
      }}
    >
      <TeamAvatar name={label} size={18} />
      <span style={{ width: 58, flexShrink: 0, fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {label}
      </span>
      <span style={{ flex: 1, minWidth: 60, position: 'relative', height: 14 }}>
        <span style={{ position: 'absolute', inset: '6px 0', background: 'rgba(255,255,255,0.07)', borderRadius: 2 }} />
        <span style={{ position: 'absolute', top: 5, height: 4, left: `${left}%`, width: `${width}%`, background: RANGE_FILL, borderRadius: 2 }} />
        {med != null && (
          <span
            title={`median ${format(med)}`}
            style={{
              position: 'absolute', top: 2, left: `calc(${pos(med)}% - 5px)`,
              width: 10, height: 10, borderRadius: '50%', background: MED_FILL,
              boxShadow: '0 0 0 2px var(--iff-surface)',
            }}
          />
        )}
      </span>
      <span className="tnum" style={{ width: 76, flexShrink: 0, textAlign: 'right', fontSize: 11, color: 'var(--iff-subtext)' }}>
        {format(min)}–{format(max)}
      </span>
      <span className="tnum" style={{ width: 42, flexShrink: 0, textAlign: 'right', fontSize: 11.5, fontWeight: 800 }}>
        {sub}
      </span>
    </div>
  )
}

function RangeLegend({ rangeLabel, medLabel }) {
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'center', margin: '0 0 8px', flexWrap: 'wrap' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ width: 14, height: 4, borderRadius: 2, background: RANGE_FILL }} />
        <span style={{ fontSize: 10.5, color: 'var(--iff-subtext)', fontWeight: 600 }}>{rangeLabel}</span>
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: MED_FILL }} />
        <span style={{ fontSize: 10.5, color: 'var(--iff-subtext)', fontWeight: 600 }}>{medLabel}</span>
      </span>
    </div>
  )
}

/* ═══════════ Sections ═══════════ */

export default function TrophyAnalytics({ showFormer }) {
  const { leagueHistory, allDisplayAssets } = useApp()
  const [hot, setHot] = useState(null)

  const ranges = useMemo(() => finishRanges(leagueHistory, !showFormer), [leagueHistory, showFormer])
  const grid = useMemo(() => finishGrid(leagueHistory, !showFormer), [leagueHistory, showFormer])
  const salary = useMemo(() => salaryRanges(allDisplayAssets, fantasyTeams), [allDisplayAssets])
  const keepers = useMemo(
    () => keeperRanges(allDisplayAssets, fantasyTeams, KEEPER_PRICE_MAX),
    [allDisplayAssets],
  )

  const money = (n) => `$${Math.round(n)}`
  const place = (n) => `${n}`

  const wildest = ranges.length
    ? [...ranges].sort((a, b) => b.volatility - a.volatility)[0]
    : null
  const steadiest = ranges.length
    ? [...ranges].filter((r) => r.seasons >= 3).sort((a, b) => a.volatility - b.volatility)[0]
    : null

  const salaryMax = Math.max(1, ...salary.map((r) => r.max))
  const keeperMax = Math.max(1, ...keepers.map((r) => r.max))

  return (
    <>
      {/* ── Finish range ── */}
      {ranges.length > 0 && (
        <section>
          <Label>RANGE OF FINISHES</Label>
          <Caption>
            Every team&apos;s floor and ceiling, ordered by median finish. The bar is best-to-worst;
            the dot is the median season. A short bar is a manager you can predict — a long one is
            a manager who has been both.
          </Caption>
          <div className="iff-card" style={{ padding: '10px 12px' }}>
            <RangeLegend rangeLabel="Best → worst finish" medLabel="Median" />
            {/* Inverted: 1st place belongs on the right, where "more" lives. */}
            {ranges.map((r, i) => (
              <Dumbbell
                key={r.team}
                label={r.team}
                sub={`${r.med}`}
                min={r.best}
                max={r.worst}
                med={r.med}
                scaleMax={Math.max(grid.maxPlace, 2)}
                invert
                format={place}
                hot={hot === `f${i}`}
                onHover={(v) => setHot(v === null ? null : `f${i}`)}
              />
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: 'var(--iff-subtext)', padding: '4px 6px 0' }}>
              <span>worst ({grid.maxPlace})</span>
              <span>1st</span>
            </div>
          </div>
          {wildest && steadiest && wildest.team !== steadiest.team && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginTop: 10 }}>
              <StatNote label="MOST VOLATILE" team={wildest.team} value={`${wildest.best} to ${wildest.worst}`} note={`${wildest.volatility} places of swing`} />
              <StatNote label="MOST PREDICTABLE" team={steadiest.team} value={`${steadiest.best} to ${steadiest.worst}`} note={`${steadiest.volatility} places of swing`} />
            </div>
          )}
        </section>
      )}

      {/* ── Finish heatmap ── */}
      {grid.seasons.length > 1 && (
        <section>
          <Label>EVERY SEASON, EVERY TEAM</Label>
          <Caption>
            One cell per team per season, brighter for a better finish. Blank means they
            weren&apos;t in the league that year. Read the rows for a career and the columns for
            a season.
          </Caption>
          <div className="iff-card" style={{ padding: '12px 12px 10px', overflowX: 'auto' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 9 }}>
              <span style={{ fontSize: 10.5, color: 'var(--iff-subtext)', fontWeight: 600 }}>1st</span>
              <span style={{ display: 'flex', gap: 2 }}>
                {PLACE_RAMP.map((c) => (
                  <span key={c} style={{ width: 16, height: 9, background: c, borderRadius: 2 }} />
                ))}
              </span>
              <span style={{ fontSize: 10.5, color: 'var(--iff-subtext)', fontWeight: 600 }}>
                {grid.maxPlace}th
              </span>
            </div>
            <div style={{ minWidth: grid.seasons.length * 22 + 90 }}>
              {grid.rows.map((r) => (
                <div key={r.team} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <span style={{ width: 66, flexShrink: 0, fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.team}
                  </span>
                  <span style={{ display: 'flex', gap: 2 }}>
                    {grid.seasons.map((s) => {
                      const p = r.places.get(s)
                      return (
                        <span
                          key={s}
                          title={p ? `${r.team} — ${s}: finished ${p}` : `${r.team} — not in the league in ${s}`}
                          style={{
                            width: 18, height: 16, borderRadius: 3,
                            background: placeColor(p, grid.maxPlace),
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 8.5, fontWeight: 800,
                            // Ink on the bright end of the ramp has to go dark
                            // to stay legible; the dim end keeps light ink.
                            color: p != null && p <= 2 ? '#0A0D1A' : 'rgba(255,255,255,0.72)',
                          }}
                        >
                          {p ?? ''}
                        </span>
                      )
                    })}
                  </span>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <span style={{ width: 66, flexShrink: 0 }} />
                <span style={{ display: 'flex', gap: 2 }}>
                  {grid.seasons.map((s) => (
                    <span key={s} style={{ width: 18, fontSize: 8.5, color: 'var(--iff-subtext)', textAlign: 'center', fontWeight: 700 }}>
                      {String(s).slice(2)}
                    </span>
                  ))}
                </span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Money ── */}
      <section>
        <Label>ROSTER MONEY</Label>
        <Caption>
          Cheapest to priciest man on each roster right now, dot at the median, total on the
          right. This is <b>current roster salary</b>, not what was spent at any past auction —
          the app has never stored a season-by-season auction history.
        </Caption>
        <div className="iff-card" style={{ padding: '10px 12px' }}>
          <RangeLegend rangeLabel="Cheapest → priciest" medLabel="Median salary" />
          {salary.map((r, i) => (
            <Dumbbell
              key={r.team}
              label={r.team}
              sub={money(r.total)}
              min={r.min}
              max={r.max}
              med={r.med}
              scaleMax={salaryMax}
              format={money}
              hot={hot === `s${i}`}
              onHover={(v) => setHot(v === null ? null : `s${i}`)}
            />
          ))}
        </div>
      </section>

      <section>
        <Label>KEEPER RANGE</Label>
        <Caption>
          Same view, but only players at or under ${KEEPER_PRICE_MAX} — the ones actually worth
          keeping. Total on the right is the keeper war chest.
        </Caption>
        <div className="iff-card" style={{ padding: '10px 12px' }}>
          <RangeLegend rangeLabel="Cheapest → priciest keeper" medLabel="Median" />
          {keepers.map((r, i) => (
            <Dumbbell
              key={r.team}
              label={r.team}
              sub={money(r.total)}
              min={r.min}
              max={r.max}
              med={r.med}
              scaleMax={keeperMax}
              format={money}
              hot={hot === `k${i}`}
              onHover={(v) => setHot(v === null ? null : `k${i}`)}
            />
          ))}
        </div>
      </section>
    </>
  )
}

function StatNote({ label, team, value, note }) {
  return (
    <div className="iff-card" style={{ padding: '11px 13px' }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--iff-subtext)', letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 900, marginTop: 3 }}>{team}</div>
      <div className="tnum" style={{ fontSize: 12, color: 'var(--iff-gold)', fontWeight: 800 }}>{value}</div>
      <div style={{ fontSize: 10.5, color: 'var(--iff-subtext)', marginTop: 1 }}>{note}</div>
    </div>
  )
}
