// PodView — the POD tab. Private to the three hosts (Jared, M. Zurek,
// Bill); gated in AppContext (isPodMember) AND in firestore.rules, since
// preseason rankings get unveiled team-by-team on the show and must not
// be readable early by the rest of the league.
//
// Four modules: True Record (schedule-luck-adjusted standings), the
// preseason Rankings table, Awards, and Bold Calls. Rankings/Awards/Bold
// Calls seed from data/podData.js and are editable in-app; whatever's
// saved to config/pod wins once written.
import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import * as fs from '../services/firestoreService'
import { computeTrueRecord, parseWeekScores } from '../services/trueRecord'
import {
  POD_PREDICTORS, POD_RANKINGS_2025, POD_AWARD_PREDICTORS,
  POD_AWARDS_2025, POD_BOLD_CALLS_2025, POD_SEED_SEASON,
} from '../data/podData'
import { TeamAvatar } from '../components/shared'

// Same preview switch the rest of the app uses — lets the POD screens be
// exercised without Firebase. Compiled out of production builds.
const DEV_PREVIEW =
  import.meta.env.DEV && new URLSearchParams(window.location.search).has('preview')

const MODULES = [
  { key: 'trueRecord', label: 'True Record' },
  { key: 'rankings', label: 'Rankings' },
  { key: 'awards', label: 'Awards' },
  { key: 'bold', label: 'Bold Calls' },
]

const fmt1 = (n) => (Number.isFinite(n) ? n.toFixed(1) : '—')
const fmtPct = (n) => (Number.isFinite(n) ? `${(n * 100).toFixed(1)}%` : '—')
const fmtLuck = (n) => (n === null || !Number.isFinite(n) ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(1)}`)

export default function PodView() {
  const { activeSeason } = useApp()
  const [module, setModule] = useState('trueRecord')
  const [pod, setPod] = useState(null) // null = loading
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (DEV_PREVIEW) { setPod({}); return }  // no Firebase in preview — fall back to seeded data
    fs.fetchPodContent().then((d) => setPod(d ?? {})).catch(() => setPod({}))
  }, [])

  async function persist(patch) {
    setPod((prev) => ({ ...prev, ...patch }))
    if (DEV_PREVIEW) return
    setSaving(true)
    try {
      await fs.savePodContent(patch)
    } catch (e) {
      alert(`Save failed: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  if (pod === null) {
    return <div className="empty-state" style={{ padding: 40 }}><div>Loading POD content…</div></div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>🎙️ The POD</h1>
        <div style={{ fontSize: 11.5, color: 'var(--iff-subtext)', marginTop: 4 }}>
          Private to Jared, M. Zurek & Bill — the rest of the league can't see this tab or its data.
          {saving && <span style={{ marginLeft: 8, color: 'var(--iff-gold)' }}>Saving…</span>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {MODULES.map((m) => (
          <button
            key={m.key}
            onClick={() => setModule(m.key)}
            className={module === m.key ? 'btn-primary' : 'btn-outline'}
            style={{ fontSize: 12, padding: '6px 14px' }}
          >
            {m.label}
          </button>
        ))}
      </div>

      {module === 'trueRecord' && <TrueRecordModule pod={pod} setPod={setPod} season={activeSeason} />}
      {module === 'rankings' && <RankingsModule pod={pod} persist={persist} />}
      {module === 'awards' && <AwardsModule pod={pod} persist={persist} />}
      {module === 'bold' && <BoldCallsModule pod={pod} persist={persist} />}
    </div>
  )
}

// ── True Record ────────────────────────────────────────────────

function TrueRecordModule({ pod, setPod, season }) {
  const [week, setWeek] = useState('')
  const [paste, setPaste] = useState('')
  const [parseErrors, setParseErrors] = useState([])
  const [busy, setBusy] = useState(false)

  const weeksMap = pod.trueRecordWeeks?.[String(season)] ?? {}
  const weeks = useMemo(
    () => Object.entries(weeksMap)
      .map(([w, scores]) => ({ week: Number(w), scores }))
      .sort((a, b) => a.week - b.week),
    [weeksMap],
  )
  const rows = useMemo(() => computeTrueRecord(weeks, pod.actualRecords?.[String(season)] ?? {}), [weeks, pod, season])

  async function addWeek() {
    const wk = Number(week)
    if (!Number.isFinite(wk) || wk < 1) { setParseErrors(['Enter a week number first.']); return }
    const { scores, errors } = parseWeekScores(paste)
    setParseErrors(errors)
    if (errors.length > 0 || scores.length < 2) {
      if (scores.length < 2 && errors.length === 0) setParseErrors(['Need at least two teams to rank a week.'])
      return
    }
    setBusy(true)
    try {
      if (!DEV_PREVIEW) await fs.savePodWeekScores(season, wk, scores)
      setPod((prev) => ({
        ...prev,
        trueRecordWeeks: {
          ...(prev.trueRecordWeeks ?? {}),
          [String(season)]: { ...(prev.trueRecordWeeks?.[String(season)] ?? {}), [String(wk)]: scores },
        },
      }))
      setPaste('')
      setWeek('')
    } catch (e) {
      setParseErrors([`Save failed: ${e.message}`])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 11.5, color: 'var(--iff-subtext)', lineHeight: 1.6 }}>
        Every week, each team is scored against <strong>all 11 others</strong> instead of just its scheduled
        opponent — top scorer goes 11-0, last goes 0-11. <strong>+/-</strong> is actual wins minus what the
        true-record rate says they earned: positive means the schedule has been kind.
      </div>

      {rows.length === 0 ? (
        <div className="iff-card empty-state" style={{ padding: 28 }}>
          <div>No weeks entered yet for {season}. Add one below.</div>
        </div>
      ) : (
        <div className="iff-card" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 520 }}>
            <thead>
              <tr style={{ color: 'var(--iff-subtext)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                <th style={{ textAlign: 'left', padding: '10px 12px' }}>Team</th>
                <th style={{ textAlign: 'right', padding: '10px 8px' }}>True W</th>
                <th style={{ textAlign: 'right', padding: '10px 8px' }}>L</th>
                <th style={{ textAlign: 'right', padding: '10px 8px' }}>Win %</th>
                <th style={{ textAlign: 'right', padding: '10px 8px' }}>Avg Pts</th>
                <th style={{ textAlign: 'right', padding: '10px 12px' }}>+/-</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.teamName} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--iff-divider)' }}>
                  <td style={{ padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <TeamAvatar name={r.teamName} size={22} />
                    <span style={{ fontWeight: 600 }}>{r.teamName}</span>
                  </td>
                  <td style={{ textAlign: 'right', padding: '9px 8px', fontWeight: 700 }}>{fmt1(r.wins)}</td>
                  <td style={{ textAlign: 'right', padding: '9px 8px', color: 'var(--iff-subtext)' }}>{fmt1(r.losses)}</td>
                  <td style={{ textAlign: 'right', padding: '9px 8px' }}>{fmtPct(r.winPct)}</td>
                  <td style={{ textAlign: 'right', padding: '9px 8px' }}>{fmt1(r.avgPoints)}</td>
                  <td style={{
                    textAlign: 'right', padding: '9px 12px', fontWeight: 700,
                    color: r.luck === null ? 'var(--iff-subtext)' : r.luck > 0 ? '#22C55E' : r.luck < 0 ? 'var(--iff-accent)' : 'inherit',
                  }}>
                    {fmtLuck(r.luck)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="iff-card" style={{ padding: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Add / Replace a Week</div>
        <div style={{ fontSize: 11, color: 'var(--iff-subtext)', marginBottom: 8, lineHeight: 1.6 }}>
          Paste one team and score per line — <code>Jared 128.4</code>, tabs or commas work too.
          Re-entering a week overwrites it.
        </div>
        <input
          type="number"
          placeholder="Week #"
          value={week}
          onChange={(e) => setWeek(e.target.value)}
          style={{ width: 110, marginBottom: 8 }}
        />
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder={'Jared 128.4\nBill 134\nM. Zurek 130.88'}
          rows={7}
          style={{ width: '100%', fontFamily: 'monospace', fontSize: 12 }}
        />
        {parseErrors.length > 0 && (
          <div style={{ fontSize: 11.5, color: 'var(--iff-accent)', marginTop: 6 }}>
            {parseErrors.map((e, i) => <div key={i}>• {e}</div>)}
          </div>
        )}
        <button className="btn-primary" onClick={addWeek} disabled={busy} style={{ marginTop: 10, fontSize: 12, padding: '7px 16px' }}>
          {busy ? 'Saving…' : 'Save Week'}
        </button>
      </div>

      {weeks.length > 0 && (
        <div style={{ fontSize: 11, color: 'var(--iff-subtext)' }}>
          Weeks entered: {weeks.map((w) => w.week).join(', ')}
        </div>
      )}
    </div>
  )
}

// ── Rankings ───────────────────────────────────────────────────

function RankingsModule({ pod, persist }) {
  const stored = pod.rankings
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(null)

  const rankings = stored ?? POD_RANKINGS_2025
  const predictors = pod.predictors ?? POD_PREDICTORS

  const withAvg = useMemo(
    () => rankings
      .map((r) => {
        const vals = predictors.map((p) => Number(r.ranks?.[p])).filter(Number.isFinite)
        return { ...r, avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null }
      })
      .sort((a, b) => (a.avg ?? 99) - (b.avg ?? 99)),
    [rankings, predictors],
  )

  function startEdit() {
    setDraft(JSON.parse(JSON.stringify(rankings)))
    setEditing(true)
  }
  async function save() {
    await persist({ rankings: draft, predictors })
    setEditing(false)
  }

  const rows = editing ? draft : withAvg

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ fontSize: 11.5, color: 'var(--iff-subtext)', flex: 1 }}>
          Preseason team-by-team rankings — unveiled one team at a time on the show.
          {!stored && ' (Showing seeded ' + POD_SEED_SEASON + ' data until you save an edit.)'}
        </div>
        {editing ? (
          <>
            <button className="btn-primary" onClick={save} style={{ fontSize: 11, padding: '5px 12px' }}>Save</button>
            <button onClick={() => setEditing(false)} style={{ fontSize: 11, padding: '5px 12px', color: 'var(--iff-subtext)' }}>Cancel</button>
          </>
        ) : (
          <button className="btn-outline" onClick={startEdit} style={{ fontSize: 11, padding: '5px 12px' }}>Edit</button>
        )}
      </div>

      <div className="iff-card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 460 }}>
          <thead>
            <tr style={{ color: 'var(--iff-subtext)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.4 }}>
              <th style={{ textAlign: 'left', padding: '10px 12px' }}>Team</th>
              {predictors.map((p) => <th key={p} style={{ textAlign: 'right', padding: '10px 8px' }}>{p}</th>)}
              <th style={{ textAlign: 'right', padding: '10px 12px' }}>Avg</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.team} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--iff-divider)' }}>
                <td style={{ padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <TeamAvatar name={r.team} size={22} />
                  <span style={{ fontWeight: 600 }}>{r.team}</span>
                </td>
                {predictors.map((p) => (
                  <td key={p} style={{ textAlign: 'right', padding: '9px 8px' }}>
                    {editing ? (
                      <input
                        type="number"
                        value={draft[i].ranks[p] ?? ''}
                        onChange={(e) => {
                          const next = [...draft]
                          next[i] = { ...next[i], ranks: { ...next[i].ranks, [p]: e.target.value === '' ? null : Number(e.target.value) } }
                          setDraft(next)
                        }}
                        style={{ width: 56, textAlign: 'right' }}
                      />
                    ) : (r.ranks?.[p] ?? '—')}
                  </td>
                ))}
                <td style={{ textAlign: 'right', padding: '9px 12px', fontWeight: 700, color: 'var(--iff-gold)' }}>
                  {editing ? '' : r.avg === null ? '—' : r.avg.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Awards ─────────────────────────────────────────────────────

function AwardsModule({ pod, persist }) {
  const stored = pod.awards
  const awards = stored ?? POD_AWARDS_2025
  const predictors = pod.awardPredictors ?? POD_AWARD_PREDICTORS
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(null)

  function startEdit() {
    setDraft(JSON.parse(JSON.stringify(awards)))
    setEditing(true)
  }
  async function save() {
    await persist({ awards: draft, awardPredictors: predictors })
    setEditing(false)
  }

  const rows = editing ? draft : awards

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ fontSize: 11.5, color: 'var(--iff-subtext)', flex: 1 }}>
          One pick per host, per category.
          {!stored && ` (Showing seeded ${POD_SEED_SEASON} data until you save an edit.)`}
        </div>
        {editing ? (
          <>
            <button className="btn-primary" onClick={save} style={{ fontSize: 11, padding: '5px 12px' }}>Save</button>
            <button onClick={() => setEditing(false)} style={{ fontSize: 11, padding: '5px 12px', color: 'var(--iff-subtext)' }}>Cancel</button>
          </>
        ) : (
          <button className="btn-outline" onClick={startEdit} style={{ fontSize: 11, padding: '5px 12px' }}>Edit</button>
        )}
      </div>

      <div className="iff-card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 520 }}>
          <thead>
            <tr style={{ color: 'var(--iff-subtext)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.4 }}>
              <th style={{ textAlign: 'left', padding: '10px 12px' }}>Category</th>
              {predictors.map((p) => <th key={p} style={{ textAlign: 'left', padding: '10px 8px' }}>{p}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((a, i) => (
              <tr key={a.category} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--iff-divider)' }}>
                <td style={{ padding: '9px 12px', fontWeight: 700 }}>{a.category}</td>
                {predictors.map((p) => (
                  <td key={p} style={{ padding: '9px 8px' }}>
                    {editing ? (
                      <input
                        value={draft[i].picks[p] ?? ''}
                        onChange={(e) => {
                          const next = [...draft]
                          next[i] = { ...next[i], picks: { ...next[i].picks, [p]: e.target.value } }
                          setDraft(next)
                        }}
                        style={{ width: '100%', minWidth: 120 }}
                      />
                    ) : (a.picks?.[p] || '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Bold Calls ─────────────────────────────────────────────────

function BoldCallsModule({ pod, persist }) {
  const stored = pod.boldCalls
  const calls = stored ?? POD_BOLD_CALLS_2025
  const hosts = Object.keys(calls)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(null)

  function startEdit() {
    setDraft(JSON.parse(JSON.stringify(calls)))
    setEditing(true)
  }
  async function save() {
    await persist({ boldCalls: draft })
    setEditing(false)
  }

  const data = editing ? draft : calls

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ fontSize: 11.5, color: 'var(--iff-subtext)', flex: 1 }}>
          Bold calls for the season — the ones we get to relitigate in December.
          {!stored && ` (Showing seeded ${POD_SEED_SEASON} data until you save an edit.)`}
        </div>
        {editing ? (
          <>
            <button className="btn-primary" onClick={save} style={{ fontSize: 11, padding: '5px 12px' }}>Save</button>
            <button onClick={() => setEditing(false)} style={{ fontSize: 11, padding: '5px 12px', color: 'var(--iff-subtext)' }}>Cancel</button>
          </>
        ) : (
          <button className="btn-outline" onClick={startEdit} style={{ fontSize: 11, padding: '5px 12px' }}>Edit</button>
        )}
      </div>

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        {hosts.map((host) => (
          <div key={host} className="iff-card" style={{ padding: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8, color: 'var(--iff-gold)' }}>{host}</div>
            {(data[host] ?? []).map((call, i) => (
              <div key={i} style={{ marginBottom: 7 }}>
                {editing ? (
                  <textarea
                    value={call}
                    onChange={(e) => {
                      const next = { ...draft, [host]: [...draft[host]] }
                      next[host][i] = e.target.value
                      setDraft(next)
                    }}
                    rows={2}
                    style={{ width: '100%', fontSize: 12 }}
                  />
                ) : (
                  <div style={{ fontSize: 12.5, lineHeight: 1.5, display: 'flex', gap: 7 }}>
                    <span style={{ color: 'var(--iff-subtext)', flexShrink: 0 }}>{i + 1}.</span>
                    <span>{call}</span>
                  </div>
                )}
              </div>
            ))}
            {editing && (
              <button
                onClick={() => setDraft({ ...draft, [host]: [...draft[host], ''] })}
                style={{ fontSize: 11, color: 'var(--iff-subtext)', marginTop: 4 }}
              >
                + Add call
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
