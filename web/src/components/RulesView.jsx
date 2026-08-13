// RulesView — League → Rules section.
// New rules this season · propose anytime · voting portal (opens on voting
// day, 7 of 12 yes votes to pass) · past rules archive.
import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { fantasyTeams } from '../data/staticData'
import { formatTradeDate } from '../services/models'

export const VOTES_TO_PASS = 7
const TEAM_COUNT = fantasyTeams.length // 12

export default function RulesView() {
  const {
    rules, rulesVotingOpen, proposeRule, voteOnRule, setVotingOpen,
    finalizeRuleVotes, activeSeason, userTeam, isAdmin,
  } = useApp()

  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showPast, setShowPast] = useState(false)

  const { newRules, proposed, past } = useMemo(() => {
    const newRules = rules.filter((r) => r.status === 'passed' && r.decidedSeason === activeSeason)
    const proposed = rules.filter((r) => r.status === 'proposed')
    const past = rules.filter(
      (r) => (r.status === 'passed' && r.decidedSeason !== activeSeason) || r.status === 'failed',
    )
    return { newRules, proposed, past }
  }, [rules, activeSeason])

  async function submit() {
    if (!title.trim()) return
    setSubmitting(true)
    try {
      await proposeRule(title.trim(), details.trim())
      setTitle('')
      setDetails('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Voting status banner ── */}
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
              ? `Cast your vote below — ${VOTES_TO_PASS} of ${TEAM_COUNT} yes votes passes a rule.`
              : 'Propose rules anytime. The commissioner opens voting on voting day.'}
          </span>
        </span>
      </div>

      {/* ── Commissioner controls ── */}
      {isAdmin && (
        <div style={{ display: 'flex', gap: 10 }}>
          {!rulesVotingOpen ? (
            <button className="btn-primary" onClick={() => setVotingOpen(true)} style={{ padding: '9px 18px', fontSize: 13 }}>
              🗳️ Open Voting
            </button>
          ) : (
            <button
              className="btn-primary"
              onClick={finalizeRuleVotes}
              style={{ padding: '9px 18px', fontSize: 13, background: '#16A34A' }}
            >
              ✓ Close Voting &amp; Tally Results
            </button>
          )}
        </div>
      )}

      {/* ── New rules this season ── */}
      <div>
        <SectionLabel>New Rules — {activeSeason}</SectionLabel>
        {newRules.length === 0 ? (
          <div className="iff-card" style={{ padding: 14, fontSize: 12, color: 'var(--iff-subtext)' }}>
            No new rules passed for {activeSeason} yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {newRules.map((r) => (
              <div key={r.id} className="iff-card" style={{ padding: 14, borderLeft: '3px solid var(--iff-green)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 800, flex: 1 }}>{r.title}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--iff-green)', background: 'rgba(74,222,128,0.15)', padding: '2px 8px', borderRadius: 6 }}>
                    PASSED
                  </span>
                </div>
                {r.details && <div style={{ fontSize: 12, color: 'var(--iff-subtext)', marginTop: 6, lineHeight: 1.5 }}>{r.details}</div>}
                <div style={{ fontSize: 10, color: 'var(--iff-subtext)', marginTop: 8 }}>
                  Proposed by {r.proposedBy} · {yesCount(r)} of {TEAM_COUNT} voted yes
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Proposed rules (+ voting when open) ── */}
      <div>
        <SectionLabel>Proposed Rules</SectionLabel>
        {proposed.length === 0 ? (
          <div className="iff-card" style={{ padding: 14, fontSize: 12, color: 'var(--iff-subtext)' }}>
            Nothing on the table. Propose one below.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {proposed.map((r) => (
              <ProposedRuleCard
                key={r.id}
                rule={r}
                votingOpen={rulesVotingOpen}
                userTeam={userTeam}
                onVote={(v) => voteOnRule(r.id, v)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Propose form ── */}
      <div className="iff-card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <SectionLabel style={{ marginBottom: 0 }}>Propose a Rule</SectionLabel>
        <input
          type="text"
          placeholder="Rule title (e.g. Two IR slots)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          rows={2}
          placeholder="What changes, and why? (optional)"
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          style={{ resize: 'vertical' }}
        />
        <button
          className="btn-primary"
          onClick={submit}
          disabled={submitting || !title.trim() || !userTeam}
          style={{ alignSelf: 'flex-end', padding: '10px 22px', fontSize: 14 }}
        >
          {submitting ? 'Submitting…' : 'Submit Proposal'}
        </button>
      </div>

      {/* ── Past rules ── */}
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
              {past.map((r) => (
                <div key={r.id} className="iff-card" style={{ padding: 12, opacity: r.status === 'failed' ? 0.65 : 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>{r.title}</span>
                    <span
                      style={{
                        fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                        color: r.status === 'passed' ? 'var(--iff-green)' : '#EF4444',
                        background: r.status === 'passed' ? 'rgba(74,222,128,0.15)' : 'rgba(239,68,68,0.15)',
                      }}
                    >
                      {r.status === 'passed' ? `PASSED ${r.decidedSeason ?? ''}` : `FAILED ${r.decidedSeason ?? ''}`}
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--iff-subtext)', marginTop: 4 }}>
                    {r.proposedBy} · {yesCount(r)}/{TEAM_COUNT} yes
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function yesCount(rule) {
  return Object.values(rule.votes ?? {}).filter((v) => v === 'yes').length
}

function SectionLabel({ children, style }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--iff-subtext)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, ...style }}>
      {children}
    </div>
  )
}

function ProposedRuleCard({ rule, votingOpen, userTeam, onVote }) {
  const votes = rule.votes ?? {}
  const yes = Object.values(votes).filter((v) => v === 'yes').length
  const no = Object.values(votes).filter((v) => v === 'no').length
  const myVote = userTeam ? votes[userTeam] : undefined

  return (
    <div className="iff-card" style={{ padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 800, flex: 1 }}>{rule.title}</span>
        <span style={{ fontSize: 10, color: 'var(--iff-subtext)', whiteSpace: 'nowrap' }}>
          {formatTradeDate(rule.proposedAt)}
        </span>
      </div>
      {rule.details && (
        <div style={{ fontSize: 12, color: 'var(--iff-subtext)', marginTop: 6, lineHeight: 1.5 }}>{rule.details}</div>
      )}
      <div style={{ fontSize: 10, color: 'var(--iff-subtext)', marginTop: 6 }}>
        Proposed by {rule.proposedBy}
      </div>

      {votingOpen && (
        <>
          {/* Tally bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
            <span className="tnum" style={{ fontSize: 11, fontWeight: 700, color: 'var(--iff-green)', width: 38 }}>
              {yes} yes
            </span>
            <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--iff-elevated)', overflow: 'hidden', display: 'flex' }}>
              <div style={{ width: `${(yes / TEAM_COUNT) * 100}%`, background: 'var(--iff-green)' }} />
              <div style={{ width: `${(no / TEAM_COUNT) * 100}%`, background: '#EF4444' }} />
            </div>
            <span className="tnum" style={{ fontSize: 11, fontWeight: 700, color: '#EF4444', width: 34, textAlign: 'right' }}>
              {no} no
            </span>
          </div>
          <div style={{ fontSize: 10, color: yes >= VOTES_TO_PASS ? 'var(--iff-green)' : 'var(--iff-subtext)', marginTop: 4 }}>
            {yes >= VOTES_TO_PASS ? '✓ Passing threshold reached' : `${VOTES_TO_PASS - yes} more yes vote${VOTES_TO_PASS - yes === 1 ? '' : 's'} needed to pass`}
          </div>

          {/* Vote buttons */}
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

      {!votingOpen && Object.keys(votes).length > 0 && (
        <div style={{ fontSize: 10, color: 'var(--iff-subtext)', marginTop: 8 }}>
          {yes} yes · {no} no so far (from a previous voting window)
        </div>
      )}
    </div>
  )
}
