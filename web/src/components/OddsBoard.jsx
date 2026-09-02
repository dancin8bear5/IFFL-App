// OddsBoard — the preseason championship odds, on the Dashboard.
//
// The content (data/preseasonOdds.js) is somebody's writing, reproduced
// word for word. This file is layout only and must never edit, truncate or
// "clean up" a blurb — the reason it is on the site instead of the group
// chat is so it can be read in full and linked to.
//
// Expanded by default, collapsible to the bare board. That is the inverse
// of a show-more, and deliberate: a show-more hides the writing from
// everyone who never presses it, and the writing is the point. The board
// it collapses TO is the part that stays useful in November.
import { useState } from 'react'
import { useApp } from '../context/AppContext'
import { teamByName } from '../data/staticData'
import { ODDS_SEASON, ODDS_TITLE, oddsTiers, oddsBoard } from '../data/preseasonOdds'
import { SectionHeader, TeamAvatar } from './shared'
import TeamLink from './TeamLink'

const STORE_KEY = `iffl.odds.collapsed.${ODDS_SEASON}`

function loadCollapsed() {
  try { return localStorage.getItem(STORE_KEY) === '1' } catch { return false }
}

/**
 * Shortest price = the favourite, longest = the longshot. Derived from the
 * board rather than written into the content, so re-ordering the source is
 * the only thing needed to change who is highlighted.
 */
const oddsValue = (odds) => {
  const [n, d] = String(odds).split('/').map(Number)
  return Number.isFinite(n) && Number.isFinite(d) && d !== 0 ? n / d : Infinity
}
const prices = oddsBoard.map((t) => oddsValue(t.odds))
const shortest = Math.min(...prices)
const longest = Math.max(...prices)

function OddsBadge({ odds, big }) {
  const v = oddsValue(odds)
  const fav = v === shortest
  const dog = v === longest
  const hue = fav ? '#F4A261' : dog ? '#F87171' : null
  return (
    <span
      className="tnum"
      style={{
        flexShrink: 0,
        fontSize: big ? 17 : 13,
        fontWeight: 800,
        letterSpacing: 0.5,
        padding: big ? '5px 12px' : '3px 9px',
        borderRadius: 8,
        // The favourite is filled, everything else outlined — so the top of
        // the board reads at a glance without colouring twelve rows.
        color: fav ? '#241A05' : hue ?? 'var(--iff-text)',
        background: fav ? 'var(--iff-gold)' : hue ? `${hue}1F` : 'var(--iff-elevated)',
        border: `1px solid ${fav ? 'var(--iff-gold)' : hue ? `${hue}66` : 'var(--iff-divider)'}`,
      }}
    >
      {odds}
    </span>
  )
}

/** One team: the header row, then the blurb in full. */
function OddsCard({ entry, mine }) {
  const team = teamByName[entry.team]
  return (
    <div
      className="iff-card"
      style={{
        display: 'flex',
        overflow: 'hidden',
        // Your own team gets an accent ring — the same trick the standings
        // use to find yourself in a list of twelve.
        border: mine ? '1.5px solid rgba(230,57,70,0.5)' : '1.5px solid transparent',
        // ...and every card carries a bar in that team's own colour. Twelve
        // cards of near-identical shape are otherwise a wall; this is what
        // makes them scannable.
        borderLeft: `3px solid ${team?.color ?? 'var(--iff-divider)'}`,
      }}
    >
      <div style={{ flex: 1, minWidth: 0, padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span
            className="tnum"
            style={{ fontSize: 11, fontWeight: 800, color: 'var(--iff-subtext)', width: 16, flexShrink: 0 }}
          >
            {entry.rank}
          </span>
          <TeamAvatar name={entry.team} size={26} />
          <span style={{ flex: 1, minWidth: 0 }}>
            {/* The odds' own spelling of the team name, not the app's. */}
            <span style={{ display: 'block', fontSize: 14, fontWeight: 800, lineHeight: 1.25 }}>
              {entry.name}
            </span>
            <span style={{ display: 'block', fontSize: 10.5, color: 'var(--iff-subtext)', marginTop: 1 }}>
              <TeamLink name={entry.team}>{team?.owner ?? entry.team}</TeamLink>
            </span>
          </span>
          <OddsBadge odds={entry.odds} big />
        </div>
        <p style={{ fontSize: 12.5, lineHeight: 1.65, color: 'var(--iff-subtext)', margin: '10px 0 0' }}>
          {entry.body}
        </p>
      </div>
    </div>
  )
}

/** The collapsed form: twelve lines, rank · logo · name · odds. */
function CompactRow({ entry, mine, last }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '8px 14px',
        borderBottom: last ? 'none' : '1px solid rgba(255,255,255,0.03)',
        background: mine ? 'rgba(230,57,70,0.08)' : 'transparent',
      }}
    >
      <span className="tnum" style={{ fontSize: 11, fontWeight: 700, color: 'var(--iff-subtext)', width: 16 }}>
        {entry.rank}
      </span>
      <TeamAvatar name={entry.team} size={20} />
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {entry.name}
      </span>
      <OddsBadge odds={entry.odds} />
    </div>
  )
}

export default function OddsBoard() {
  const { userTeam } = useApp()
  const [collapsed, setCollapsed] = useState(loadCollapsed)

  function toggle() {
    const next = !collapsed
    setCollapsed(next)
    try { localStorage.setItem(STORE_KEY, next ? '1' : '0') } catch { /* private mode */ }
  }

  return (
    <div>
      <SectionHeader
        title={`🎰 ${ODDS_TITLE}`}
        actionLabel={collapsed ? '▾ Read the odds' : '▴ Collapse'}
        onAction={toggle}
      />

      {collapsed ? (
        <div className="iff-card" style={{ marginTop: 10, overflow: 'hidden' }}>
          {oddsBoard.map((entry, i) => (
            <CompactRow
              key={entry.name}
              entry={entry}
              mine={entry.team === userTeam}
              last={i === oddsBoard.length - 1}
            />
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 12 }}>
          {oddsTiers.map((tier) => (
            <div key={tier.key}>
              {/* Tier heading, verbatim — including the "..." and the aside. */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 8,
                  padding: '0 0 7px',
                  borderBottom: `2px solid ${tier.color}55`,
                  marginBottom: 10,
                }}
              >
                <span style={{ fontSize: 14 }}>{tier.glyph}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: tier.color, letterSpacing: 0.3 }}>
                  {tier.heading}
                </span>
              </div>
              {tier.aside && (
                <div style={{ fontSize: 11.5, fontStyle: 'italic', color: 'var(--iff-subtext)', margin: '-4px 0 10px' }}>
                  {tier.aside}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {tier.teams.map((t) => {
                  const entry = oddsBoard.find((b) => b.name === t.name)
                  return <OddsCard key={t.name} entry={entry} mine={t.team === userTeam} />
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
