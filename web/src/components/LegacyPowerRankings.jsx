// LegacyPowerRankings — the Dashboard's lead visual between seasons.
//
// In-season, PowerRankingsChart ranks rosters by salary. That question goes
// dead the moment the season ends, so from then until kickoff the board
// shows the ranking that never goes stale: everything everyone has done
// since 2009, scored as career wins + championships — per season played,
// so a long tenure doesn't outrank a better manager who joined late.
//
// FORM: ranked horizontal stacked bar. Horizontal because the categories
// are 12 named teams; stacked because each bar is a part-to-whole — wins
// earned vs belts won — and ranked because magnitude order IS the story.
// Same form as its in-season counterpart on purpose: it's the same
// question ("where does everyone stand") asked over a longer window, and
// switching chart types between seasons would read as a different metric.
//
// COLOR: CATEGORICAL, two slots — and note this differs from the in-season
// chart's ordinal ramp, correctly. There, both segments were dollars, one
// measure split into tiers. Here the segments are two different things
// converted to a common currency, so they take two identities:
//
//   #5488CE  wins  — the grind, cool and workmanlike
//   #C68334  belts — the glory, gold, this league's trophy color
//
// Both were validated against the card surface (#141827) with the dataviz
// validator on the dark band: lightness in 0.48–0.67, chroma over floor,
// adjacent CVD ΔE 22.2 (protan) / 23.7 (tritan), normal-vision ΔE 24.7,
// contrast over 3:1 — all five checks PASS. They are NOT the raw --iff-gold
// token, which sits at L 0.781, well outside the dark band and too light to
// hold its own as a data fill. Keep these flat: no gradients, no glow. If
// either value changes, re-run the validator before shipping.
//
// Bars are NOT colored per team. Bar length already encodes value and the
// belt count is already double-encoded as pips, so spending the identity
// channel on 12 team hues would re-encode what's there and cost the
// wins/belts distinction its only channel. The viewer's own team is marked
// with a text token, never a hue.
//
// Championships appear twice on every row — as gold pips and as the gold
// bar segment — so the count is never carried by color alone.
//
// Values are direct-labeled at each bar tip, which is what lets this drop
// gridlines entirely. Label text wears text tokens, never the data color.
import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { computeLegacyRankings, CHAMPIONSHIP_POINTS } from '../services/legacyRankings'
import { TeamAvatar } from './shared'

// Validated categorical pair — see header. Flat fills, no gradients.
const WIN_FILL = '#5488CE'
const BELT_FILL = '#C68334'
const BAR_H = 13
const PODIUM_BAR_H = 17 // top three read heavier; see PODIUM below
const GAP = 2 // surface-colored gap between stacked segments

// Medal tints for the top three rank numerals. These are CHROME, not data:
// they sit on the rank glyph, never on a mark, so they encode nothing the
// bars already encode and are exempt from the categorical palette. The
// codebase already precedents rank emphasis in text (PowerRankingsChart
// golds its top three). A hairline under third place closes the podium.
const PODIUM = 3
const MEDAL = ['#D4A24C', '#B8BFC9', '#B07A48']

// Scores are rates now, so they need a decimal. One place: enough to
// separate teams, few enough to stay readable at 11px. Sorting always uses
// full precision — only the label rounds.
const fmt = (n) => n.toFixed(1)

/**
 * Reads `leagueHistory` but deliberately does NOT load it — DashboardView,
 * its only mount point, already calls loadLeagueHistory() for the other
 * history tiles, and fetchLeagueHistory is a whole-collection read that
 * bills every time. Renders its empty state until that lands. Anywhere else
 * this gets reused has to load the collection itself.
 */
export default function LegacyPowerRankings({ onOpenFull }) {
  const { leagueHistory, userTeam } = useApp()
  const [hovered, setHovered] = useState(null)
  const [showMath, setShowMath] = useState(false)
  // Bars grow from zero on first paint. Purely decorative — the row, its
  // labels and the tooltip are all correct before it runs and if it never
  // runs at all (reduced motion, no JS transition support).
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    const id = requestAnimationFrame(() => setRevealed(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const rows = useMemo(() => computeLegacyRankings(leagueHistory), [leagueHistory])

  const span = useMemo(() => {
    const years = (leagueHistory ?? []).map((s) => s.season).filter(Number.isFinite)
    return years.length ? { from: Math.min(...years), to: Math.max(...years) } : null
  }, [leagueHistory])

  const maxScore = Math.max(1, ...rows.map((r) => r.score))
  const active = hovered == null ? null : rows[hovered]

  // The headline this league actually argues about: who's on top, and by
  // how much. A ranked list answers the first question and buries the
  // second — the gap between #1 and #2 is the whole conversation.
  const lead = rows.length > 1 ? rows[0].score - rows[1].score : null

  if (!rows.length) {
    return (
      <div className="iff-card" style={{ padding: '14px 16px' }}>
        <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: -0.2 }}>All-Time Power Rankings</div>
        <div className="empty-state" style={{ padding: 24 }}>
          <div>League history hasn't been seeded yet.</div>
        </div>
      </div>
    )
  }

  return (
    <div className="iff-card" style={{ padding: '14px 16px 12px', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 3 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: -0.2 }}>All-Time Power Rankings</div>
          <div style={{ fontSize: 10.5, color: 'var(--iff-subtext)', marginTop: 2 }}>
            Wins + championships per season{span ? ` · ${span.from}–${span.to}` : ''}
          </div>
        </div>
        {onOpenFull && (
          <button onClick={onOpenFull} style={{ fontSize: 11, fontWeight: 700, color: 'var(--iff-accent)', whiteSpace: 'nowrap' }}>
            Full view ›
          </button>
        )}
      </div>

      {/* Legend — always present for two series; identity never color-alone.
          The scoring rule sits behind a disclosure next to it because it is
          the thing this league will argue about, and an argument needs the
          number in front of it. */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', margin: '8px 0 10px', flexWrap: 'wrap' }}>
        {[['Wins', WIN_FILL], ['Championships', BELT_FILL]].map(([label, fill]) => (
          <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: fill, flexShrink: 0 }} />
            <span style={{ fontSize: 10.5, color: 'var(--iff-subtext)', fontWeight: 600 }}>{label}</span>
          </span>
        ))}
        <button
          onClick={() => setShowMath((v) => !v)}
          aria-expanded={showMath}
          style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--iff-subtext)', marginLeft: 'auto', whiteSpace: 'nowrap' }}
        >
          How it&apos;s scored {showMath ? '▴' : '▾'}
        </button>
      </div>

      {/* Leader callout — the standings answer "who's first", never "by how
          much", and the margin is the part worth arguing about. Text tokens
          and a gold accent on the name only; no new data color. */}
      {lead != null && (
        <div
          style={{
            display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap',
            fontSize: 11.5, color: 'var(--iff-subtext)', lineHeight: 1.5,
            borderLeft: `2px solid ${BELT_FILL}`, paddingLeft: 9, margin: '0 0 11px',
          }}
        >
          <span style={{ fontWeight: 900, fontSize: 13, color: 'var(--iff-text)' }}>
            {rows[0].teamName}
          </span>
          <span>
            leads all-time
            {lead > 0 ? (
              <>
                {' — '}
                <span className="tnum" style={{ fontWeight: 800, color: 'var(--iff-text)' }}>{fmt(lead)}</span>
                {' clear of '}
                {rows[1].teamName}
              </>
            ) : (
              <> — dead level with {rows[1].teamName}</>
            )}
          </span>
        </div>
      )}

      {showMath && (
        <div
          style={{
            fontSize: 11, color: 'var(--iff-subtext)', lineHeight: 1.6,
            background: 'var(--iff-elevated)', border: '1px solid var(--iff-divider)',
            borderRadius: 8, padding: '9px 11px', marginBottom: 10,
          }}
        >
          <span className="tnum" style={{ color: 'var(--iff-text)', fontWeight: 800 }}>
            (1 win = 1 pt · 1 belt = {CHAMPIONSHIP_POINTS} pts) ÷ seasons played
          </span>
          <div style={{ marginTop: 4 }}>
            A title is worth about two seasons of wins. Everything is then divided
            by the years you&apos;ve been in — this ranks what a manager is worth per season,
            not how long he&apos;s been showing up.
          </div>
        </div>
      )}

      <div role="list" aria-label={`All-time power rankings, ${rows.length} teams by wins and championships per season played`}>
        {rows.map((r, i) => {
          const isMine = r.teamName === userTeam
          const winPct = revealed ? (r.winPoints / maxScore) * 100 : 0
          const beltPct = revealed ? (r.beltPoints / maxScore) * 100 : 0
          const isHot = hovered === i
          const onPodium = r.rank <= PODIUM
          const barH = onPodium ? PODIUM_BAR_H : BAR_H
          return (
            <button
              key={r.teamName}
              role="listitem"
              onClick={onOpenFull}
              onPointerEnter={() => setHovered(i)}
              onPointerLeave={() => setHovered(null)}
              onFocus={() => setHovered(i)}
              onBlur={() => setHovered(null)}
              aria-label={
                `${r.teamName}, rank ${r.rank}, ${fmt(r.score)} points per season — ` +
                `${r.wins} career wins and ${r.championships} championship${r.championships === 1 ? '' : 's'} ` +
                `over ${r.seasons} season${r.seasons === 1 ? '' : 's'}`
              }
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                // Hit target is the whole row, comfortably taller than the bar
                padding: onPodium ? '7px 6px' : '5px 6px', borderRadius: 7, textAlign: 'left',
                background: isHot ? 'rgba(255,255,255,0.045)' : 'transparent',
                transition: 'background 0.12s',
                // Closes the podium. A hairline, not a gap — the scale is
                // continuous and a break would imply the ranking isn't.
                borderBottom: r.rank === PODIUM ? '1px solid var(--iff-divider)' : 'none',
                marginBottom: r.rank === PODIUM ? 4 : 0,
              }}
            >
              <span
                className="tnum"
                style={{
                  width: 15, flexShrink: 0, textAlign: 'right',
                  fontSize: onPodium ? 13 : 11, fontWeight: onPodium ? 900 : 800,
                  color: onPodium ? MEDAL[r.rank - 1] : 'var(--iff-subtext)',
                }}
              >
                {r.rank}
              </span>

              <TeamAvatar name={r.teamName} size={onPodium ? 22 : 18} />

              <span
                style={{
                  width: 62, flexShrink: 0, fontSize: onPodium ? 12.5 : 11.5,
                  fontWeight: onPodium ? 800 : 700,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  // Own-team emphasis via a text token, not a second hue
                  color: isMine ? 'var(--iff-accent)' : 'var(--iff-text)',
                }}
              >
                {r.teamName}
              </span>

              {/* Belt pips — the second encoding of championships, so the
                  count never rides on the gold segment alone. Fixed width
                  so bars stay aligned down the column whether a team has
                  three belts or none. */}
              <span
                aria-hidden="true"
                style={{ width: 26, flexShrink: 0, display: 'flex', gap: 2, justifyContent: 'flex-start' }}
              >
                {Array.from({ length: Math.min(r.championships, 3) }, (_, k) => (
                  <span key={k} style={{ width: 6, height: 6, borderRadius: '50%', background: BELT_FILL }} />
                ))}
              </span>

              {/* Bar track. Segments are separated by a surface-colored gap,
                  never a stroke; only the outer data-end is rounded. */}
              <span style={{ flex: 1, minWidth: 40, display: 'flex', alignItems: 'center', height: barH }}>
                <span style={{ display: 'flex', width: '100%', height: barH }}>
                  <span
                    className="legacy-bar"
                    style={{
                      width: `${winPct}%`, background: WIN_FILL, height: '100%',
                      borderRadius: r.beltPoints > 0 ? '2px 0 0 2px' : '2px 4px 4px 2px',
                      marginRight: r.beltPoints > 0 ? GAP : 0,
                      '--legacy-delay': `${i * 35}ms`,
                    }}
                  />
                  {r.beltPoints > 0 && (
                    <span
                      className="legacy-bar"
                      style={{
                        width: `${beltPct}%`, background: BELT_FILL, height: '100%',
                        borderRadius: '0 4px 4px 0',
                        '--legacy-delay': `${i * 35}ms`,
                      }}
                    />
                  )}
                </span>
              </span>

              <span
                className="tnum"
                style={{
                  width: 34, flexShrink: 0, textAlign: 'right',
                  fontSize: onPodium ? 13 : 11.5, fontWeight: onPodium ? 900 : 800,
                  color: 'var(--iff-text)',
                }}
              >
                {fmt(r.score)}
              </span>
            </button>
          )
        })}
      </div>

      {/* Hover/focus readout — enhances, never gates: every value here is
          also in the row itself or the full history table. */}
      {active && (
        <div
          role="status"
          style={{
            position: 'absolute', right: 14, bottom: 10, pointerEvents: 'none',
            background: 'var(--iff-elevated)', border: '1px solid var(--iff-divider)',
            borderRadius: 9, padding: '8px 11px', boxShadow: '0 6px 20px rgba(0,0,0,0.45)',
            display: 'flex', flexDirection: 'column', gap: 3, minWidth: 150,
          }}
        >
          <span style={{ fontSize: 11.5, fontWeight: 800 }}>{active.teamName}</span>
          {[
            ['Wins / season', fmt(active.winPoints), WIN_FILL],
            [
              `Belts / season (${active.championships}×${CHAMPIONSHIP_POINTS})`,
              fmt(active.beltPoints),
              BELT_FILL,
            ],
          ].map(([label, value, fill]) => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
              <span style={{ width: 8, height: 2, background: fill, flexShrink: 0 }} />
              <span className="tnum" style={{ fontWeight: 800 }}>{value}</span>
              <span style={{ color: 'var(--iff-subtext)' }}>{label}</span>
            </span>
          ))}
          <span style={{ fontSize: 10, color: 'var(--iff-subtext)', marginTop: 1 }}>
            {active.seasons} season{active.seasons === 1 ? '' : 's'} · {active.wins}-{active.losses}
            {active.ties ? `-${active.ties}` : ''} · {(active.pct * 100).toFixed(1)}%
            <br />
            {active.careerPoints} career pts ÷ {active.seasons}
          </span>
        </div>
      )}
    </div>
  )
}
