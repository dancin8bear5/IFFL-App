// RulesView — league rules, structured proposals, and the voting portal.
// Opened as an overlay from the Dashboard's Rules & Reminders section.
//
// A proposal carries: title, category (Money / Starters / Rosters / Misc),
// a summary, and a list of concrete rule changes (rule → current → new).
// Voting: one Y/N per team while the commissioner has the portal open;
// 7 of 12 yes passes.
import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { fantasyTeams, VOTES_TO_PASS, RULE_CATEGORIES, categoryMeta, SCORING, ESPN_LEAGUE_ID } from '../data/staticData'
import { handbook } from '../data/rulebookSeed'
import { banStatus } from '../services/ruleVoting'
import { formatTradeDate } from '../services/models'
import { DetailOverlay } from './shared'

const TEAM_COUNT = fantasyTeams.length // 12

// Rule governance constants live in staticData; re-exported here so the
// existing imports across the app keep working.
export { VOTES_TO_PASS, RULE_CATEGORIES, categoryMeta }

/** Overlay wrapper used by the Dashboard link. */
export default function RulesOverlay({ onClose }) {
  return (
    <DetailOverlay title="League Rules" onBack={onClose} desktop="wide">
      <div style={{ paddingTop: 12 }}>
        <RulesBody />
      </div>
    </DetailOverlay>
  )
}

export function RulesBody() {
  const {
    rules, rulesVotingOpen, proposeRule, voteOnRule, setVotingOpen,
    finalizeRuleVotes, activeSeason, userTeam, isAdmin,
  } = useApp()

  const [showForm, setShowForm] = useState(false)
  const [showPast, setShowPast] = useState(false)
  const [filter, setFilter] = useState('All')
  const [section, setSection] = useState('Proposals')

  const { newRules, proposed, past } = useMemo(() => {
    const byCat = (r) => filter === 'All' || (r.category ?? 'Operations') === filter
    return {
      newRules: rules.filter((r) => r.status === 'passed' && r.decidedSeason === activeSeason).filter(byCat),
      proposed: rules.filter((r) => r.status === 'proposed').filter(byCat),
      past: rules.filter(
        (r) => (r.status === 'passed' && r.decidedSeason !== activeSeason) || r.status === 'failed',
      ).filter(byCat),
    }
  }, [rules, activeSeason, filter])

  return (
    <div style={{ padding: '0 14px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Section switcher — the living rulebook, not just the vote */}
      <div style={{ display: 'flex', background: 'var(--iff-elevated)', borderRadius: 12, padding: 3 }}>
        {['Proposals', 'Rulebook', 'Scoring'].map((s) => (
          <button
            key={s}
            onClick={() => setSection(s)}
            style={{
              flex: 1, padding: '8px 6px', borderRadius: 9, fontSize: 12.5, fontWeight: 700,
              background: section === s ? 'var(--iff-surface)' : 'transparent',
              color: section === s ? 'var(--iff-text)' : 'var(--iff-subtext)',
              boxShadow: section === s ? '0 1px 4px rgba(0,0,0,0.35)' : 'none',
            }}
          >
            {s}
          </button>
        ))}
      </div>

      {section === 'Rulebook' && <HandbookSection />}
      {section === 'Scoring' && <ScoringSection />}
      {section === 'Proposals' && <>

      {/* Voting status */}
      <div
        className="iff-card"
        style={{
          padding: 14, display: 'flex', alignItems: 'center', gap: 12,
          border: rulesVotingOpen ? '1.5px solid rgba(74,222,128,0.5)' : '1px solid transparent',
          background: rulesVotingOpen
            ? 'linear-gradient(135deg, rgba(74,222,128,0.12), var(--iff-surface) 60%)'
            : 'var(--iff-surface)',
        }}
      >
        <span style={{ fontSize: 22 }}>{rulesVotingOpen ? '🗳️' : '🔒'}</span>
        <span style={{ flex: 1 }}>
          <span style={{ display: 'block', fontSize: 14, fontWeight: 700 }}>
            {rulesVotingOpen ? 'Voting is OPEN' : 'Voting portal closed'}
          </span>
          <span style={{ display: 'block', fontSize: 11, color: 'var(--iff-subtext)', marginTop: 2 }}>
            {rulesVotingOpen
              ? `${VOTES_TO_PASS} of ${TEAM_COUNT} yes votes passes a rule.`
              : 'Propose rules anytime. The commissioner opens voting on voting day.'}
          </span>
        </span>
      </div>

      {isAdmin && (
        <div style={{ display: 'flex', gap: 10 }}>
          {!rulesVotingOpen ? (
            <button className="btn-primary" onClick={() => setVotingOpen(true)} style={{ padding: '9px 18px', fontSize: 13 }}>
              🗳️ Open Voting
            </button>
          ) : (
            <button className="btn-primary" onClick={finalizeRuleVotes} style={{ padding: '9px 18px', fontSize: 13, background: '#16A34A' }}>
              ✓ Close Voting &amp; Tally Results
            </button>
          )}
        </div>
      )}

      {/* Category filter */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {['All', ...RULE_CATEGORIES.map((c) => c.key)].map((c) => {
          const meta = c === 'All' ? null : categoryMeta(c)
          const active = filter === c
          return (
            <button
              key={c}
              onClick={() => setFilter(c)}
              style={{
                padding: '5px 12px', borderRadius: 18, fontSize: 11.5, fontWeight: 700,
                background: active ? (meta?.color ?? 'var(--iff-accent)') : 'var(--iff-elevated)',
                color: active ? '#0A0D1A' : 'var(--iff-subtext)',
              }}
            >
              {meta ? `${meta.glyph} ${c}` : 'All'}
            </button>
          )
        })}
      </div>

      {/* New rules this season */}
      <div>
        <Label>New Rules — {activeSeason}</Label>
        {newRules.length === 0 ? (
          <div className="iff-card" style={{ padding: 14, fontSize: 12, color: 'var(--iff-subtext)' }}>
            No new rules passed for {activeSeason} yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {newRules.map((r) => <RuleCard key={r.id} rule={r} passed />)}
          </div>
        )}
      </div>

      {/* Proposals */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <Label style={{ marginBottom: 0 }}>Proposed Rules</Label>
          <button className="btn-outline" onClick={() => setShowForm(true)} style={{ fontSize: 11, padding: '5px 14px' }}>
            ＋ Propose
          </button>
        </div>
        {proposed.length === 0 ? (
          <div className="iff-card" style={{ padding: 14, fontSize: 12, color: 'var(--iff-subtext)' }}>
            Nothing on the table{filter !== 'All' ? ` in ${filter}` : ''}. Propose one.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {proposed.map((r) => (
              <RuleCard
                key={r.id}
                rule={r}
                season={activeSeason}
                votingOpen={rulesVotingOpen}
                userTeam={userTeam}
                onVote={(v) => voteOnRule(r.id, v)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Past */}
      {past.length > 0 && (
        <div>
          <button
            onClick={() => setShowPast((v) => !v)}
            style={{ fontSize: 11, fontWeight: 700, color: 'var(--iff-subtext)', textTransform: 'uppercase', letterSpacing: 0.5, padding: '0 2px 8px' }}
          >
            Past Rules ({past.length}) {showPast ? '▴' : '▾'}
          </button>
          {showPast && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {past.map((r) => <RuleCard key={r.id} rule={r} compact />)}
            </div>
          )}
        </div>
      )}
      </>}

      {showForm && <ProposalForm onClose={() => setShowForm(false)} onSubmit={proposeRule} disabled={!userTeam} />}
    </div>
  )
}

/* ═══════════ Rulebook (static handbook) ═══════════ */

function HandbookSection() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 11.5, color: 'var(--iff-subtext)', lineHeight: 1.5, padding: '0 2px' }}>
        The standing rules of the league, from the 2025 League Document. Changes go through
        Proposals — this page always shows the rules as they stand.
      </div>
      {handbook.map((group) => (
        <div key={group.section} className="iff-card" style={{ padding: 0, overflow: 'hidden', borderLeft: `3px solid ${group.color}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', borderBottom: '1px solid var(--iff-divider)' }}>
            <span style={{ fontSize: 15 }}>{group.glyph}</span>
            <span style={{ fontSize: 13.5, fontWeight: 800 }}>{group.section}</span>
          </div>
          {group.entries.map((e, i) => (
            <div key={e.rule} style={{ padding: '10px 14px', borderTop: i ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 3 }}>{e.rule}</div>
              <div style={{ fontSize: 12, color: 'var(--iff-subtext)', lineHeight: 1.55 }}>{e.detail}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

/* ═══════════ Scoring reference ═══════════ */

function ScoringSection() {
  const fmt = (v) => (v > 0 && v < 1 ? String(v) : v > 0 ? `+${v}` : String(v))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* The headline rule change gets the marquee */}
      <div
        className="iff-card"
        style={{
          padding: 16, textAlign: 'center',
          background: 'linear-gradient(135deg, rgba(56,189,248,0.14), var(--iff-surface) 65%)',
          border: '1.5px solid rgba(56,189,248,0.4)',
        }}
      >
        <div className="tnum" style={{ fontSize: 30, fontWeight: 900, color: '#38BDF8' }}>0.5 PPR</div>
        <div style={{ fontSize: 12, color: 'var(--iff-subtext)', marginTop: 4 }}>
          Half a point per reception, every position — new for 2026
        </div>
      </div>

      {Object.entries(SCORING).map(([group, rows]) => (
        <div key={group} className="iff-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '11px 14px', fontSize: 13.5, fontWeight: 800, borderBottom: '1px solid var(--iff-divider)' }}>
            {group}
          </div>
          {rows.map((r, i) => (
            <div
              key={r.label}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                padding: '9px 14px', borderTop: i ? '1px solid rgba(255,255,255,0.04)' : 'none',
                background: r.highlight ? 'rgba(56,189,248,0.08)' : 'transparent',
              }}
            >
              <span style={{ fontSize: 12.5, fontWeight: r.highlight ? 700 : 500 }}>{r.label}</span>
              <span
                className="tnum"
                style={{
                  fontSize: 13, fontWeight: 800,
                  color: r.highlight ? '#38BDF8' : r.value < 0 ? '#EF4444' : 'var(--iff-gold)',
                }}
              >
                {fmt(r.value)}
              </span>
            </div>
          ))}
        </div>
      ))}

      <div style={{ fontSize: 11, color: 'var(--iff-subtext)', lineHeight: 1.6, padding: '0 2px' }}>
        Official scoring lives in ESPN league {ESPN_LEAGUE_ID} — this card mirrors those settings.
      </div>
    </div>
  )
}

function Label({ children, style }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--iff-subtext)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, ...style }}>
      {children}
    </div>
  )
}

const yesCount = (r) => Object.values(r.votes ?? {}).filter((v) => v === 'yes').length
const noCount = (r) => Object.values(r.votes ?? {}).filter((v) => v === 'no').length

export function RuleCard({ rule, votingOpen, userTeam, onVote, passed, compact, season }) {
  const meta = categoryMeta(rule.category)
  const yes = yesCount(rule)
  const no = noCount(rule)
  const myVote = userTeam ? (rule.votes ?? {})[userTeam] : undefined
  const changes = rule.changes ?? []
  const ban = season ? banStatus(rule, season) : { banned: false }

  return (
    <div
      className="iff-card"
      style={{
        padding: compact ? 12 : 14,
        borderLeft: passed ? '3px solid var(--iff-green)' : `3px solid ${meta.color}`,
        opacity: rule.status === 'failed' ? 0.7 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 9.5, fontWeight: 700, color: meta.color, background: `${meta.color}22`, padding: '2px 7px', borderRadius: 5 }}>
              {meta.glyph} {rule.category ?? 'Misc'}
            </span>
            <span style={{ fontSize: compact ? 13 : 14.5, fontWeight: 800 }}>{rule.title}</span>
          </span>
        </span>
        {ban.banned ? <Badge color="#EF4444" bg="rgba(239,68,68,0.15)">BANNED · BACK {ban.eligibleAgain}</Badge> : <StatusBadge rule={rule} />}
      </div>

      {(rule.yearsProposed ?? 0) > 1 && !compact && (
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--iff-gold)', marginTop: 6 }}>
          Year {rule.yearsProposed} on the ballot
        </div>
      )}

      {(rule.summary || rule.details) && !compact && (
        <div style={{ fontSize: 12, color: 'var(--iff-subtext)', marginTop: 7, lineHeight: 1.5 }}>
          {rule.summary ?? rule.details}
        </div>
      )}

      {/* Concrete rule changes */}
      {changes.length > 0 && !compact && (
        <div style={{ marginTop: 10, background: 'var(--iff-elevated)', borderRadius: 9, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) 1fr 1fr', gap: 6, padding: '6px 10px', fontSize: 9, fontWeight: 700, color: 'var(--iff-subtext)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid var(--iff-divider)' }}>
            <span>Rule</span><span>Current</span><span>New</span>
          </div>
          {changes.map((c, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) 1fr 1fr', gap: 6, padding: '6px 10px', fontSize: 11.5, alignItems: 'center', borderTop: i ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
              <span style={{ fontWeight: 600 }}>{c.rule}</span>
              <span className="tnum" style={{ color: 'var(--iff-subtext)', textDecoration: 'line-through' }}>{c.currentValue || '—'}</span>
              <span className="tnum" style={{ color: 'var(--iff-green)', fontWeight: 700 }}>{c.newValue || '—'}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 10, color: 'var(--iff-subtext)', marginTop: 8 }}>
        {rule.proposedBy}{rule.proposedAt ? ` · ${formatTradeDate(rule.proposedAt)}` : ''}
        {(passed || compact) && ` · ${yes}/${TEAM_COUNT} yes`}
      </div>

      {ban.banned && (
        <div style={{ fontSize: 11, color: '#EF4444', marginTop: 8, lineHeight: 1.5 }}>
          Rejected two years running — banned from the ballot until {ban.eligibleAgain}.
        </div>
      )}

      {votingOpen && onVote && !ban.banned && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
            <span className="tnum" style={{ fontSize: 11, fontWeight: 700, color: 'var(--iff-green)', width: 38 }}>{yes} yes</span>
            <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--iff-elevated)', overflow: 'hidden', display: 'flex' }}>
              <div style={{ width: `${(yes / TEAM_COUNT) * 100}%`, background: 'var(--iff-green)' }} />
              <div style={{ width: `${(no / TEAM_COUNT) * 100}%`, background: '#EF4444' }} />
            </div>
            <span className="tnum" style={{ fontSize: 11, fontWeight: 700, color: '#EF4444', width: 34, textAlign: 'right' }}>{no} no</span>
          </div>
          <div style={{ fontSize: 10, color: yes >= VOTES_TO_PASS ? 'var(--iff-green)' : 'var(--iff-subtext)', marginTop: 4 }}>
            {yes >= VOTES_TO_PASS ? '✓ Passing threshold reached' : `${VOTES_TO_PASS - yes} more yes vote${VOTES_TO_PASS - yes === 1 ? '' : 's'} needed`}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
            <button
              onClick={() => onVote('yes')}
              disabled={!userTeam}
              style={{
                padding: '9px 8px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                color: myVote === 'yes' ? '#fff' : 'var(--iff-green)',
                background: myVote === 'yes' ? '#16A34A' : 'rgba(74,222,128,0.1)',
                border: '1.5px solid rgba(74,222,128,0.5)',
              }}
            >
              👍 Yes{myVote === 'yes' ? ' — your vote' : ''}
            </button>
            <button
              onClick={() => onVote('no')}
              disabled={!userTeam}
              style={{
                padding: '9px 8px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                color: myVote === 'no' ? '#fff' : '#EF4444',
                background: myVote === 'no' ? '#DC2626' : 'rgba(239,68,68,0.1)',
                border: '1.5px solid rgba(239,68,68,0.5)',
              }}
            >
              👎 No{myVote === 'no' ? ' — your vote' : ''}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function StatusBadge({ rule }) {
  const yr = rule.decidedSeason ? ` ${rule.decidedSeason}` : ''
  switch (rule.status) {
    case 'passed':
      return <Badge color="var(--iff-green)" bg="rgba(74,222,128,0.15)">PASSED{yr}</Badge>
    case 'failed':
      return <Badge color="#EF4444" bg="rgba(239,68,68,0.15)">FAILED{yr}</Badge>
    case 'deferred':
      // Eligible, but lost its category — resubmit next year (not a rejection)
      return <Badge color="#38BDF8" bg="rgba(56,189,248,0.15)">RESUBMIT{yr}</Badge>
    case 'tiebreak':
      return <Badge color="var(--iff-gold)" bg="rgba(244,162,97,0.2)">TIEBREAK</Badge>
    default:
      return <Badge color="var(--iff-gold)" bg="rgba(244,162,97,0.15)">PROPOSED</Badge>
  }
}

function Badge({ children, color, bg }) {
  return (
    <span style={{ fontSize: 9, fontWeight: 700, color, background: bg, padding: '2px 8px', borderRadius: 6, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
}

/* ═══════════ Proposal form ═══════════ */

function ProposalForm({ onClose, onSubmit, disabled }) {
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('Operations')
  const [summary, setSummary] = useState('')
  const [changes, setChanges] = useState([{ rule: '', currentValue: '', newValue: '' }])
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  const setChange = (i, patch) =>
    setChanges((c) => c.map((row, idx) => (idx === i ? { ...row, ...patch } : row)))

  const canSend = title.trim() && summary.trim() && !submitting && !disabled

  async function submit() {
    setSubmitting(true)
    try {
      await onSubmit({
        title: title.trim(),
        category,
        summary: summary.trim(),
        changes: changes.filter((c) => c.rule.trim() || c.newValue.trim()),
      })
      setSent(true)
      setTimeout(onClose, 900)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <DetailOverlay title="Propose a Rule" onBack={onClose}>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {sent ? (
          <div className="empty-state">
            <div className="glyph">📜</div>
            <div className="title">Proposal Submitted</div>
            <div>The league can see it now. It goes to a vote on voting day.</div>
          </div>
        ) : (
          <>
            <Field label="Title">
              <input
                type="text"
                placeholder="e.g. Raise the auction budget"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>

            <Field label="Category">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {RULE_CATEGORIES.map((c) => {
                  const active = category === c.key
                  return (
                    <button
                      key={c.key}
                      onClick={() => setCategory(c.key)}
                      style={{
                        padding: '7px 14px', borderRadius: 18, fontSize: 12, fontWeight: 700,
                        background: active ? c.color : 'var(--iff-elevated)',
                        color: active ? '#0A0D1A' : 'var(--iff-subtext)',
                      }}
                    >
                      {c.glyph} {c.key}
                    </button>
                  )
                })}
              </div>
            </Field>

            <Field label="Proposal Summary">
              <textarea
                rows={3}
                placeholder="What are you proposing, and why should the league want it?"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                style={{ resize: 'vertical' }}
              />
            </Field>

            <div>
              <div style={{ fontSize: 12, color: 'var(--iff-subtext)', marginBottom: 6 }}>
                Rules That Require Change
              </div>
              <div className="iff-card" style={{ overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) 1fr 1fr 26px', gap: 6, padding: '8px 10px', fontSize: 9.5, fontWeight: 700, color: 'var(--iff-subtext)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid var(--iff-divider)' }}>
                  <span>Rule</span><span>Current</span><span>New</span><span />
                </div>
                {changes.map((c, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) 1fr 1fr 26px', gap: 6, padding: '7px 10px', alignItems: 'center', borderTop: i ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                    <input
                      type="text" placeholder="Auction budget" value={c.rule}
                      onChange={(e) => setChange(i, { rule: e.target.value })}
                      style={{ fontSize: 12, padding: '7px 8px' }}
                    />
                    <input
                      type="text" placeholder="$200" value={c.currentValue}
                      onChange={(e) => setChange(i, { currentValue: e.target.value })}
                      style={{ fontSize: 12, padding: '7px 8px', textAlign: 'center' }}
                    />
                    <input
                      type="text" placeholder="$225" value={c.newValue}
                      onChange={(e) => setChange(i, { newValue: e.target.value })}
                      style={{ fontSize: 12, padding: '7px 8px', textAlign: 'center' }}
                    />
                    <button
                      onClick={() => setChanges((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)))}
                      aria-label="Remove change row"
                      style={{ color: 'var(--iff-subtext)', fontSize: 13, textAlign: 'center' }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => setChanges((prev) => [...prev, { rule: '', currentValue: '', newValue: '' }])}
                  style={{ width: '100%', padding: '9px 10px', fontSize: 12, fontWeight: 700, color: 'var(--iff-gold)', textAlign: 'left', borderTop: '1px solid var(--iff-divider)' }}
                >
                  ＋ Add another rule change
                </button>
              </div>
              <div style={{ fontSize: 10, color: 'var(--iff-subtext)', marginTop: 6 }}>
                List every rule this touches so the league votes on exact values, not vibes.
              </div>
            </div>

            <button className="btn-primary" onClick={submit} disabled={!canSend}>
              {submitting ? 'Submitting…' : 'Submit Proposal'}
            </button>
            {disabled && (
              <div style={{ fontSize: 11, color: 'var(--iff-accent)', textAlign: 'center' }}>
                You need an assigned team to propose rules.
              </div>
            )}
          </>
        )}
      </div>
    </DetailOverlay>
  )
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--iff-subtext)' }}>
      {label}
      {children}
    </label>
  )
}
