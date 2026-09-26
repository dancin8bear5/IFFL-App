// RookieDraftBoard — a rookie draft class as a colour-coded board.
//
// Four wide, six deep. That isn't arbitrary: the class is exactly 24 picks
// (two rounds of twelve), so a 4-wide grid puts the round break on a row
// boundary — rows 1-3 are round one, rows 4-6 round two — and the whole
// draft fits on one screen without scrolling on a laptop.
//
// Each cell is filled with its position's colour, which is the fastest way
// to read the shape of a class: a wall of blue means everyone took
// receivers. Text on those fills is dark ink, not white — all four
// position colours clear 5:1 against #0B0F17 and fail against white, so
// white would have been the intuitive choice and the unreadable one.
import { useMemo, useState } from 'react'
import { useIsDesktop } from '../hooks/useBreakpoint'
import { toRoundGrids, draftSummary, slotLabelOf, DRAFT_POSITIONS } from '../services/rookieDraft'
import { POSITION_COLORS, POSITION_INK } from '../data/staticData'
import TeamLink from './TeamLink'

/** Trim "Philadelphia Eagles" to something that fits a cell. */
const proShort = (name) => {
  if (!name) return ''
  const parts = String(name).trim().split(/\s+/)
  return parts.length > 1 ? parts[parts.length - 1] : parts[0]
}

/**
 * @param picks        made picks, and (in the live room) unmade slots — a
 *                     cell with no `name` renders as a slot still waiting.
 * @param onClockSlot  the slot currently up, ringed in the accent colour
 * @param highlightTeam a team whose slots get a subtle outline — "yours"
 */
export default function RookieDraftBoard({
  picks, season, seasons = [], onSeason, onClockSlot = null, highlightTeam = '',
}) {
  const isDesktop = useIsDesktop()
  // Four across is the shape of the class, but at phone width four cells
  // leaves ~85px each and every player name truncates to "Jeremiya…",
  // which defeats the whole point of a board. Two across still breaks the
  // rounds on a row boundary, because 12 divides by 2 as cleanly as by 4.
  const cols = isDesktop ? 4 : 2
  const grids = useMemo(() => toRoundGrids(picks, cols), [picks, cols])
  const summary = useMemo(() => draftSummary(picks), [picks])
  const [hovered, setHovered] = useState(null)

  if (grids.length === 0) {
    return (
      <div className="iff-card empty-state" style={{ padding: 24 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 4 }}>No draft on file</div>
        <div style={{ fontSize: 11.5, color: 'var(--iff-subtext)', lineHeight: 1.6 }}>
          Rookie drafts appear here once a class has been recorded.
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Season switcher + the shape of the class in one line */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {seasons.length > 1 && (
          <div style={{ display: 'flex', gap: 6 }}>
            {seasons.map((y) => (
              <button
                key={y}
                onClick={() => onSeason?.(y)}
                aria-pressed={y === season}
                style={{
                  padding: '4px 12px', borderRadius: 14, fontSize: 11.5, fontWeight: 700,
                  background: y === season ? 'var(--iff-accent)' : 'var(--iff-elevated)',
                  color: y === season ? '#fff' : 'var(--iff-subtext)',
                }}
              >
                {y}
              </button>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11, color: 'var(--iff-subtext)' }}>
          {DRAFT_POSITIONS.filter((p) => summary.byPosition[p]).map((p) => (
            <span key={p} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: POSITION_COLORS[p], display: 'inline-block' }} />
              {p} <strong style={{ color: 'var(--iff-text)' }}>{summary.byPosition[p]}</strong>
            </span>
          ))}
          {summary.traded > 0 && (
            <span>· <strong style={{ color: 'var(--iff-text)' }}>{summary.traded}</strong> of {summary.total} slots had been traded</span>
          )}
        </div>
      </div>

      {/* The board, a round at a time */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {grids.map(({ round, rows }, gi) => (
          <div key={round ?? gi} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {round != null && (
              <div style={{
                fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase',
                color: 'var(--iff-subtext)', marginTop: gi === 0 ? 0 : 8,
              }}>
                Round {round}
              </div>
            )}
            {rows.map((row, ri) => (
              <div key={ri} style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 6 }}>
                {row.map((pick, ci) => {
                  if (!pick) return <div key={ci} />
                  const key = `${round}-${ri}-${ci}`
                  const onClock = pick.slot && pick.slot === onClockSlot
                  const mine = highlightTeam && pick.team === highlightTeam
                  // A slot with no selection yet — the live room's empty
                  // squares. It keeps the cell's footprint so the board
                  // doesn't reflow as picks come in, and shows the two
                  // things that matter before a pick exists: whose it is
                  // and where it sits.
                  if (!pick.name) {
                    return (
                      <div
                        key={key}
                        style={{
                          background: onClock ? 'rgba(230,57,70,0.10)' : 'var(--iff-elevated)',
                          border: onClock
                            ? '1.5px solid var(--iff-accent)'
                            : `1px dashed ${mine ? 'var(--iff-gold)' : 'var(--iff-border, rgba(255,255,255,0.10))'}`,
                          borderRadius: 8, padding: '8px 10px', minWidth: 0,
                          display: 'flex', flexDirection: 'column', gap: 2,
                          color: 'var(--iff-subtext)',
                        }}
                      >
                        {/* The team, not the round: the round is already
                            the heading above, and whose pick it is is the
                            only thing an empty square has to say. */}
                        <div style={{
                          fontSize: 12.5, fontWeight: 800, lineHeight: 1.2, color: 'var(--iff-text)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {pick.team ?? '—'}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, fontSize: 10, opacity: 0.9 }}>
                          <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {pick.via ? `from ${pick.via}` : ''}
                          </span>
                          <span className="tnum" style={{ fontWeight: 800, flexShrink: 0 }}>{slotLabelOf(pick)}</span>
                        </div>
                        {onClock && (
                          <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--iff-accent)', marginTop: 1 }}>
                            On the clock
                          </div>
                        )}
                      </div>
                    )
                  }
                  const fill = POSITION_COLORS[pick.position] ?? 'var(--iff-elevated)'
                  const known = Boolean(POSITION_COLORS[pick.position])
                  return (
                    <div
                      key={key}
                      onMouseEnter={() => setHovered(key)}
                      onMouseLeave={() => setHovered(null)}
                      title={pick.via ? `${pick.team} — ${pick.via}` : pick.team}
                      style={{
                        background: fill,
                        outline: mine ? '1.5px solid var(--iff-gold)' : 'none',
                        // A position we don't have a colour for keeps app text
                        // tokens; dark ink on an unknown fill could vanish.
                        color: known ? POSITION_INK : 'var(--iff-text)',
                        borderRadius: 8, padding: '8px 10px', minWidth: 0,
                        display: 'flex', flexDirection: 'column', gap: 2,
                        transform: hovered === key ? 'translateY(-1px)' : 'none',
                        boxShadow: hovered === key ? '0 3px 10px rgba(0,0,0,0.35)' : 'none',
                        transition: 'transform 0.12s, box-shadow 0.12s',
                      }}
                    >
                      <div style={{
                        fontSize: 12.5, fontWeight: 800, lineHeight: 1.2,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {pick.name}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, fontSize: 10, opacity: 0.82 }}>
                        <span style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {pick.position}{pick.nflTeam ? ` · ${proShort(pick.nflTeam)}` : ''}
                        </span>
                        <span className="tnum" style={{ fontWeight: 800, flexShrink: 0 }}>{slotLabelOf(pick)}</span>
                      </div>
                      <div style={{
                        fontSize: 10.5, fontWeight: 700, marginTop: 1,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {/* Inherits the cell's dark ink rather than the link
                            colour, which is tuned for the app surface and
                            would disappear on these fills. */}
                        <TeamLink name={pick.team} style={{ color: 'inherit' }} />
                        {pick.via && (
                          <span style={{ fontWeight: 500, opacity: 0.75 }}> · {pick.via.replace(/^via\s*/i, 'from ')}</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
