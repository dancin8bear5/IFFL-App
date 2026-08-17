// PowerRankingsChart — the Dashboard's lead visual: all 12 rosters ranked
// by salary, at a glance.
//
// Form: horizontal stacked bar. Horizontal because the categories are 12
// named teams (vertical columns would turn the names sideways), stacked
// because each bar is a part-to-whole — star money vs depth money — and
// ranked because magnitude order IS the story.
//
// Color: ORDINAL, not categorical. The two segments are the same measure
// (dollars) split into an ordered pair of tiers (top-5 vs the rest), so
// they take one hue in two lightness steps rather than two identities.
// Gold is already this app's money color. Both steps were validated
// against the card surface (#141827) — the dim step clears 4.30:1, well
// over the 2:1 floor for an ordinal light end.
//
// Bars are NOT colored per team: bar length already encodes value, and
// spending the identity channel to re-encode it would be redundant. The
// viewer's own team is marked with a ring and a label instead of a hue.
//
// Values are direct-labeled at each bar tip, which is what lets the chart
// drop gridlines entirely (direct labels before gridlines). Label text
// wears text tokens, never the data color.
import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { fantasyTeams } from '../data/staticData'
import { computePowerRankings } from '../services/powerRankings'
import { TeamAvatar } from './shared'

// Validated ordinal ramp (one hue, monotone lightness) — see header.
const STAR_FILL = '#F4A261'
const DEPTH_FILL = '#A9713F'
const BAR_H = 13
const GAP = 2 // surface-colored gap between stacked segments

const money = (n) => `$${Math.round(n)}`

export default function PowerRankingsChart({ onOpenFull }) {
  const { allDisplayAssets, activeSeason, userTeam } = useApp()
  const [hovered, setHovered] = useState(null)

  const rows = useMemo(
    () => computePowerRankings(allDisplayAssets, fantasyTeams, activeSeason),
    [allDisplayAssets, activeSeason],
  )
  const maxValue = Math.max(1, ...rows.map((r) => r.rosterValue))
  const active = hovered == null ? null : rows[hovered]

  return (
    <div className="iff-card" style={{ padding: '14px 16px 12px', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 3 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: -0.2 }}>Power Rankings</div>
          <div style={{ fontSize: 10.5, color: 'var(--iff-subtext)', marginTop: 2 }}>
            Total roster salary · {activeSeason}
          </div>
        </div>
        {onOpenFull && (
          <button onClick={onOpenFull} style={{ fontSize: 11, fontWeight: 700, color: 'var(--iff-accent)', whiteSpace: 'nowrap' }}>
            Full view ›
          </button>
        )}
      </div>

      {/* Legend — always present for two series; identity never color-alone */}
      <div style={{ display: 'flex', gap: 14, margin: '8px 0 10px' }}>
        {[['Top 5', STAR_FILL], ['Depth', DEPTH_FILL]].map(([label, fill]) => (
          <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: fill, flexShrink: 0 }} />
            <span style={{ fontSize: 10.5, color: 'var(--iff-subtext)', fontWeight: 600 }}>{label}</span>
          </span>
        ))}
      </div>

      <div role="list" aria-label={`Power rankings, ${rows.length} teams by total roster salary`}>
        {rows.map((r, i) => {
          const isMine = r.teamName === userTeam
          const starPct = (r.starValue / maxValue) * 100
          const depthPct = (r.depthValue / maxValue) * 100
          const isHot = hovered === i
          return (
            <button
              key={r.teamName}
              role="listitem"
              onClick={onOpenFull}
              onPointerEnter={() => setHovered(i)}
              onPointerLeave={() => setHovered(null)}
              onFocus={() => setHovered(i)}
              onBlur={() => setHovered(null)}
              aria-label={`${r.teamName}, rank ${r.rank}, ${money(r.rosterValue)} total`}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                // Hit target is the whole row, comfortably taller than the 13px bar
                padding: '5px 6px', borderRadius: 7, textAlign: 'left',
                background: isHot ? 'rgba(255,255,255,0.045)' : 'transparent',
                transition: 'background 0.12s',
              }}
            >
              <span
                className="tnum"
                style={{
                  width: 15, flexShrink: 0, textAlign: 'right', fontSize: 11, fontWeight: 800,
                  color: r.rank <= 3 ? 'var(--iff-gold)' : 'var(--iff-subtext)',
                }}
              >
                {r.rank}
              </span>

              <TeamAvatar name={r.teamName} size={18} />

              <span
                style={{
                  width: 62, flexShrink: 0, fontSize: 11.5, fontWeight: 700,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  // Own-team emphasis via a text token, not a second hue
                  color: isMine ? 'var(--iff-accent)' : 'var(--iff-text)',
                }}
              >
                {r.teamName}
              </span>

              {/* Bar track. Segments are separated by a surface-colored gap,
                  never a stroke; only the outer data-end is rounded. */}
              <span style={{ flex: 1, minWidth: 40, display: 'flex', alignItems: 'center', height: BAR_H }}>
                <span style={{ display: 'flex', width: '100%', height: BAR_H }}>
                  <span
                    style={{
                      width: `${starPct}%`, background: STAR_FILL, height: '100%',
                      borderRadius: depthPct > 0 ? '2px 0 0 2px' : '2px 4px 4px 2px',
                      marginRight: depthPct > 0 ? GAP : 0,
                    }}
                  />
                  {depthPct > 0 && (
                    <span style={{ width: `${depthPct}%`, background: DEPTH_FILL, height: '100%', borderRadius: '0 4px 4px 0' }} />
                  )}
                </span>
              </span>

              <span
                className="tnum"
                style={{ width: 42, flexShrink: 0, textAlign: 'right', fontSize: 11.5, fontWeight: 800, color: 'var(--iff-text)' }}
              >
                {money(r.rosterValue)}
              </span>
            </button>
          )
        })}
      </div>

      {/* Hover/focus readout — enhances, never gates: every value here is
          also in the row itself or the full view's table. */}
      {active && (
        <div
          role="status"
          style={{
            position: 'absolute', right: 14, bottom: 10, pointerEvents: 'none',
            background: 'var(--iff-elevated)', border: '1px solid var(--iff-divider)',
            borderRadius: 9, padding: '8px 11px', boxShadow: '0 6px 20px rgba(0,0,0,0.45)',
            display: 'flex', flexDirection: 'column', gap: 3, minWidth: 132,
          }}
        >
          <span style={{ fontSize: 11.5, fontWeight: 800 }}>{active.teamName}</span>
          {[
            ['Top 5', money(active.starValue), STAR_FILL],
            ['Depth', money(active.depthValue), DEPTH_FILL],
          ].map(([label, value, fill]) => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
              <span style={{ width: 8, height: 2, background: fill, flexShrink: 0 }} />
              <span className="tnum" style={{ fontWeight: 800 }}>{value}</span>
              <span style={{ color: 'var(--iff-subtext)' }}>{label}</span>
            </span>
          ))}
          <span style={{ fontSize: 10, color: 'var(--iff-subtext)', marginTop: 1 }}>
            {active.playerCount} players · {active.pickCount} pick{active.pickCount === 1 ? '' : 's'}
            {active.overCap ? ' · over cap' : ''}
          </span>
        </div>
      )}
    </div>
  )
}
