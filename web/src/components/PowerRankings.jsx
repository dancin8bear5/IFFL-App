// PowerRankings — the Taylor Made Power Rankings on the Dashboard.
//
// Layout only. The writing in data/powerRankings2026.js is twelve owners'
// voices reproduced word for word, emoji and typos included; nothing here
// edits, trims or "cleans up" a single character of it.
//
// Design note, since it is the whole brief: the only decoration in this
// block is the grade colour. Twelve cards of identical shape read as a wall
// otherwise, and the grade strip is the one thing you actually compare
// across teams. No icons, no badges, no ornament — the prose is the point
// and everything else gets out of its way.
import { Fragment, useState } from 'react'
import { useApp } from '../context/AppContext'
import { teamByName } from '../data/staticData'
import {
  RANKINGS_TITLE, RANKINGS_DEK, RANKINGS_STANDARD, RANKINGS_SUBHEAD,
  lookback, LOOKBACK_FOOT, essays, rankings, ladder,
} from '../data/powerRankings2026'
import { releasedTeams, isWaveOut, isLadderOut, waveStates } from '../services/rankingsRelease'

/** A → green, B → gold, C → neutral, D/F → red. The plus/minus rides along. */
function gradeColor(grade) {
  const letter = String(grade ?? '').trim().charAt(0).toUpperCase()
  if (letter === 'A') return 'var(--iff-green)'
  if (letter === 'B') return 'var(--iff-gold)'
  if (letter === 'C') return 'var(--iff-subtext)'
  if (letter === 'D' || letter === 'F') return '#F87171'
  return 'var(--iff-subtext)'
}

const SLOT_LABEL = { QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', DEPTH: 'DEP', OWNER: 'OWN' }

function GradeStrip({ grades }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: 9 }}>
      {Object.entries(grades ?? {}).map(([slot, grade]) => (
        <span key={slot} style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
          <span style={{ color: 'var(--iff-subtext)', fontWeight: 700, letterSpacing: 0.4 }}>
            {SLOT_LABEL[slot] ?? slot}
          </span>{' '}
          <span style={{ color: gradeColor(grade), fontWeight: 800 }}>{grade}</span>
        </span>
      ))}
    </div>
  )
}

function Collapse({ label, sub, children, defaultOpen = false, tone }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'baseline', gap: 10, width: '100%',
          padding: '9px 0', borderBottom: `1px solid ${tone ?? 'var(--iff-divider)'}`,
          textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: tone ?? 'var(--iff-text)' }}>
          {label}
        </span>
        {sub && <span style={{ fontSize: 10.5, color: 'var(--iff-subtext)' }}>{sub}</span>}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--iff-subtext)' }}>{open ? '⌃' : '⌄'}</span>
      </button>
      {open && <div style={{ paddingTop: 12 }}>{children}</div>}
    </div>
  )
}

/**
 * The body text is stored with real newlines — several owners write in
 * one-line bursts and that rhythm IS the voice, so each line becomes its
 * own paragraph rather than being reflowed into a block.
 */
function Prose({ text, style }) {
  return (
    <>
      {String(text).split('\n').map((line, i) => (
        <p key={i} style={{ fontSize: 13, lineHeight: 1.65, color: 'var(--iff-subtext)', margin: i ? '7px 0 0' : 0, ...style }}>
          {line}
        </p>
      ))}
    </>
  )
}

function TeamCard({ entry, mine }) {
  const [open, setOpen] = useState(false)
  const team = teamByName[entry.team]
  return (
    <div
      className="iff-card"
      style={{
        padding: '14px 16px',
        border: mine ? '1.5px solid rgba(230,57,70,0.5)' : '1.5px solid transparent',
        borderLeft: `3px solid ${team?.color ?? 'var(--iff-divider)'}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <span
          className="tnum"
          style={{ fontSize: 26, fontWeight: 900, letterSpacing: -1.5, color: 'var(--iff-subtext)', lineHeight: 1, minWidth: 34 }}
        >
          {String(entry.rank).padStart(2, '0')}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 15, fontWeight: 800, lineHeight: 1.2 }}>{entry.name}</span>
          <span style={{ display: 'block', fontSize: 11, color: 'var(--iff-subtext)', marginTop: 2 }}>{entry.owner}</span>
        </span>
        <span style={{ fontSize: 22, fontWeight: 900, color: gradeColor(entry.verdictGrade), lineHeight: 1 }}>
          {entry.verdictGrade}
        </span>
      </div>

      <GradeStrip grades={entry.grades} />

      <div style={{ borderTop: '1px solid var(--iff-divider)', margin: '12px 0 0', paddingTop: 12 }}>
        {open ? (
          <>
            {entry.sections.map((s) => (
              <div key={s.label} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--iff-subtext)', marginBottom: 6 }}>
                  {s.label}
                </div>
                <Prose text={s.body} style={{ color: 'var(--iff-text)' }} />
              </div>
            ))}

            {/* The one boxed element per team. The PIVOT PLAYER is the device
                the whole piece is built on, so it gets to look like one. */}
            <div
              style={{
                border: '1px solid var(--iff-divider)', borderRadius: 10,
                background: 'var(--iff-elevated)', padding: '12px 14px', marginBottom: 16,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 7 }}>
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--iff-subtext)' }}>
                  Pivot Player
                </span>
                <span style={{ fontSize: 13.5, fontWeight: 800 }}>{entry.pivot.player}</span>
              </div>
              <Prose text={entry.pivot.body} />
            </div>

            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--iff-subtext)', marginBottom: 6 }}>
              Final Verdict — <span style={{ color: gradeColor(entry.verdictGrade) }}>{entry.verdictGrade}</span>
            </div>
            <Prose text={entry.verdict} style={{ color: 'var(--iff-text)' }} />
          </>
        ) : (
          // Collapsed, the verdict IS the summary — so the board reads top
          // to bottom in one pass without anyone opening a card.
          <Prose text={entry.verdict} />
        )}
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          style={{ marginTop: 10, fontSize: 11, fontWeight: 700, color: 'var(--iff-accent)' }}
        >
          {open ? 'Collapse ⌃' : 'Read more ⌄'}
        </button>
      </div>
    </div>
  )
}

function Lookback() {
  return (
    <div className="iff-card" style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 460 }}>
        <thead>
          <tr style={{ color: 'var(--iff-subtext)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            <th style={{ textAlign: 'right', padding: '10px 8px' }}>™️</th>
            <th style={{ textAlign: 'left', padding: '10px 8px' }}>Owner</th>
            <th style={{ textAlign: 'left', padding: '10px 8px' }}>Team</th>
            <th style={{ textAlign: 'right', padding: '10px 8px' }}>Final</th>
            <th style={{ textAlign: 'right', padding: '10px 12px 10px 8px' }}>Miss</th>
          </tr>
        </thead>
        <tbody>
          {lookback.map((r) => {
            const color = r.miss === 0 ? 'var(--iff-subtext)' : r.miss > 0 ? 'var(--iff-green)' : '#F87171'
            return (
              <tr key={r.owner} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                <td className="tnum" style={{ textAlign: 'right', padding: '8px', color: 'var(--iff-subtext)' }}>{r.rank}</td>
                <td style={{ padding: '8px', fontWeight: 700, whiteSpace: 'nowrap' }}>{r.owner}</td>
                <td style={{ padding: '8px', color: 'var(--iff-subtext)' }}>
                  {r.team}
                  {r.note && (
                    <span style={{ marginLeft: 7, fontSize: 9, fontWeight: 800, letterSpacing: 0.6, color: 'var(--iff-gold)' }}>
                      {r.note}
                    </span>
                  )}
                </td>
                <td className="tnum" style={{ textAlign: 'right', padding: '8px', fontWeight: 700 }}>{r.final}</td>
                <td className="tnum" style={{ textAlign: 'right', padding: '8px 12px 8px 8px', color, fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {r.miss === 0 ? 'exact' : `${r.miss > 0 ? '+' : '−'}${Math.abs(r.miss)} ${r.miss > 0 ? '▲' : '▼'}`}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div style={{ fontSize: 10.5, color: 'var(--iff-subtext)', padding: '10px 12px', borderTop: '1px solid var(--iff-divider)', lineHeight: 1.5 }}>
        {LOOKBACK_FOOT}
      </div>
    </div>
  )
}

export default function PowerRankings({ level }) {
  const { userTeam } = useApp()
  const out = releasedTeams(level, rankings)
  const waves = waveStates(level)

  return (
    <div>
      <div style={{ marginBottom: 4 }}>
        <div style={{ fontSize: 19, fontWeight: 900, letterSpacing: -0.4 }}>{RANKINGS_TITLE}</div>
        <div style={{ fontSize: 11.5, color: 'var(--iff-subtext)', marginTop: 3 }}>{RANKINGS_DEK}</div>
        <div style={{ fontSize: 11.5, color: 'var(--iff-subtext)', marginTop: 6, lineHeight: 1.5 }}>
          {RANKINGS_STANDARD}
          <br />
          {RANKINGS_SUBHEAD}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 12 }}>
        {isWaveOut(level, 'intro') && (
          <Collapse label="Introduction" sub="The lookback · the auction · the machine">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingBottom: 6 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--iff-subtext)', marginBottom: 8 }}>
                  The ™️ Lookback — 2025 preseason ranking vs. where it ended
                </div>
                <Lookback />
              </div>
              {essays.map((e) => (
                <div key={e.title}>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--iff-subtext)', marginBottom: 8 }}>
                    {e.title}
                  </div>
                  <Prose text={e.body} />
                </div>
              ))}
            </div>
          </Collapse>
        )}

        {waves.filter((w) => w.from).map((wave) => {
          const teams = out.filter((t) => t.rank <= wave.from && t.rank >= wave.to)
          if (!wave.out) {
            return (
              <div
                key={wave.key}
                style={{
                  display: 'flex', alignItems: 'baseline', gap: 10, padding: '9px 0',
                  borderBottom: '1px solid var(--iff-divider)', opacity: 0.45,
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase' }}>
                  {wave.label}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--iff-subtext)' }}>Not yet released</span>
              </div>
            )
          }
          return (
            <Collapse key={wave.key} label={wave.label} sub={wave.blurb} defaultOpen>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 6 }}>
                {teams.map((t) => (
                  <TeamCard key={t.rank} entry={t} mine={t.team === userTeam} />
                ))}
              </div>
            </Collapse>
          )
        })}

        {isLadderOut(level) && (
          <Collapse label="The Ladder" sub="2026 preseason, 1 → 12">
            <div className="iff-card" style={{ overflow: 'hidden', marginBottom: 6 }}>
              {ladder.map((t, i) => (
                <div
                  key={t.rank}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px',
                    borderBottom: i === ladder.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.03)',
                    background: t.team === userTeam ? 'rgba(230,57,70,0.08)' : 'transparent',
                  }}
                >
                  <span className="tnum" style={{ fontSize: 12, fontWeight: 800, color: 'var(--iff-subtext)', width: 20, textAlign: 'right' }}>
                    {t.rank}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600 }}>{t.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--iff-subtext)', whiteSpace: 'nowrap' }}>{t.owner}</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: gradeColor(t.verdictGrade), width: 22, textAlign: 'right' }}>
                    {t.verdictGrade}
                  </span>
                </div>
              ))}
            </div>
          </Collapse>
        )}
      </div>
    </div>
  )
}
