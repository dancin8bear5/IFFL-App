// PodView — the POD tab. Private to the three hosts (Jared, M. Zurek,
// Bill); gated in AppContext (isPodMember) AND in firestore.rules, since
// preseason rankings get unveiled team-by-team on the show and must not
// be readable early by the rest of the league.
//
// Four modules: True Record (schedule-luck-adjusted standings), the
// preseason Rankings table, Awards, and Bold Calls. Rankings/Awards/Bold
// Calls seed from data/podData.js and are editable in-app; whatever's
// saved to config/pod wins once written.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import * as fs from '../services/firestoreService'
import {
  POD_AWARD_PREDICTORS, POD_AWARDS_2025, POD_BOLD_CALLS_2025, POD_SEED_SEASON,
} from '../data/podData'
import { TeamAvatar } from '../components/shared'
import {
  spoilerId, isBlank, isRevealed, toggle as toggleSpoiler, loadStore, saveStore,
} from '../services/podSpoiler'
import { columnFor, mergeAwardPicks, mergeBoldCalls, hasChanges } from '../services/podAwards'
import GradeSheet from '../components/GradeSheet'
import { usePowerRankings } from '../hooks/usePowerRankings'
import '../styles/powerRankings.css'

// Same preview switch the rest of the app uses — lets the POD screens be
// exercised without Firebase. Compiled out of production builds.
const DEV_PREVIEW =
  import.meta.env.DEV && new URLSearchParams(window.location.search).has('preview')

// True Record was removed Sep 11 at the commissioner's request. It also
// carried the ONLY weekly-score entry in the app, so nothing writes
// weeklyScores/{season} any more and standings, seeds and the bracket sit
// at whatever was already entered. `fs.saveWeekScores` and
// `weeklyStats.parseWeekScores` are deliberately still there, so putting
// score entry back is a form and not a rebuild.
const MODULES = [
  { key: 'rankings', label: 'Rankings' },
  { key: 'awards', label: 'Awards' },
  { key: 'bold', label: 'Bold Calls' },
]

const fmt1 = (n) => (Number.isFinite(n) ? n.toFixed(1) : '—')
const fmtPct = (n) => (Number.isFinite(n) ? `${(n * 100).toFixed(1)}%` : '—')
const fmtLuck = (n) => (n === null || !Number.isFinite(n) ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(1)}`)

export default function PodView() {
  const [module, setModule] = useState('rankings')
  const [pod, setPod] = useState(null) // null = loading
  const [saving, setSaving] = useState(false)
  // Which entries have been clicked open. Lives in this browser only — see
  // services/podSpoiler.js for why it is keyed to the value and not the cell.
  const [revealed, setRevealed] = useState(loadStore)

  /** Put every field back behind its bar. */
  const resetReveals = useCallback(() => {
    setRevealed({})
    saveStore({})
  }, [])

  const toggleReveal = useCallback((id, value) => {
    setRevealed((prev) => {
      const next = toggleSpoiler(prev, id, value)
      saveStore(next)
      return next
    })
  }, [])

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
        {/* Only offered once something is open — a permanent Reset on a
            fully masked page is a button that does nothing. */}
        {Object.keys(revealed).length > 0 && (
          <button
            className="btn-outline"
            onClick={resetReveals}
            style={{ fontSize: 11, padding: '5px 12px', marginTop: 8 }}
          >
            Reset · re-mask {Object.keys(revealed).length}
          </button>
        )}
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

      {module === 'rankings' && <RankingsModule />}
      {module === 'awards' && <AwardsModule pod={pod} persist={persist} revealed={revealed} onReveal={toggleReveal} />}
      {module === 'bold' && <BoldCallsModule pod={pod} persist={persist} revealed={revealed} onReveal={toggleReveal} />}
    </div>
  )
}

// ── Rankings ───────────────────────────────────────────────────

/**
 * The Taylor Made grade sheet, the same component the Dashboard renders.
 *
 * The POD's OWN preseason rankings (each host ranking twelve teams) used to
 * live here. That data is untouched in `config/pod.rankings` and in
 * `POD_RANKINGS_2025`; this tab simply stops showing it.
 *
 * The release gate still applies: the hosts see what the league sees.
 * Fetching an unreleased drop to show it here would undo the one rule the
 * whole feature rests on.
 */
function RankingsModule() {
  const { teams, loading, released } = usePowerRankings()
  return (
    <div className="pr-page" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 11.5, color: 'var(--iff-subtext)' }}>
        {loading
          ? 'Loading…'
          : teams.length
            ? `Taylor Made Power Rankings · ${teams.length} of 12 released.`
            : 'Nothing released yet — open a section in Admin → Season.'}
      </div>
      {!loading && teams.length > 0 && (
        <div className="iff-card" style={{ overflow: 'hidden' }}>
          <GradeSheet teams={teams} />
        </div>
      )}
    </div>
  )
}

// ── Spoiler ────────────────────────────────────────────────────

/**
 * One entry, black until clicked.
 *
 * The value stays in the DOM and is hidden with colour rather than being
 * swapped for a placeholder — that is what keeps the awards table's column
 * widths identical before and after a reveal, so opening one cell can't
 * shove the rows around it. See theme.css `.pod-spoiler`.
 *
 * A blank entry is returned untouched: a black bar over an empty cell would
 * advertise a pick nobody made.
 */
function Spoiler({ id, value, revealed, onReveal, blank = '—', locked = false }) {
  if (isBlank(value)) return blank
  const shown = isRevealed(revealed, id, value)
  // `locked` is someone else's field while you are editing yours. It is a
  // plain span, not a button — no click, no keyboard, no reveal. Editing
  // your own picks is not a reason to see theirs, and a bar that only
  // LOOKS locked is the exact failure this guards against.
  if (locked) {
    return <span className="pod-spoiler" aria-label="Hidden — another host's entry">{value}</span>
  }
  return (
    <button
      type="button"
      className={shown ? 'pod-spoiler revealed' : 'pod-spoiler'}
      onClick={() => onReveal(id, value)}
      aria-expanded={shown}
      aria-label={shown ? `Hide ${value}` : 'Reveal this pick'}
      title={shown ? 'Click to hide again' : 'Click to reveal'}
    >
      {value}
    </button>
  )
}

// ── Awards ─────────────────────────────────────────────────────

function AwardsModule({ pod, persist, revealed, onReveal }) {
  const { userTeam } = useApp()
  const stored = pod.awards
  const awards = stored ?? POD_AWARDS_2025
  const predictors = pod.awardPredictors ?? POD_AWARD_PREDICTORS
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)

  // The one column this host owns. Null means read-only — see
  // services/podAwards.js; the commissioner gets no override, because a
  // prediction somebody else can edit is not a prediction.
  const myColumn = columnFor(userTeam, predictors)

  function startEdit() {
    setDraft(JSON.parse(JSON.stringify(awards)))
    setEditing(true)
  }

  async function save() {
    setSaving(true)
    try {
      // Merge onto a FRESH read, not onto the copy this editor opened with.
      // config/pod has no listener, so the screen can be minutes stale, and
      // saving the stale copy is exactly how one host reverts another.
      let latest = awards
      try {
        const fresh = await fs.fetchPodContent()
        if (fresh?.awards) latest = fresh.awards
      } catch { /* offline or preview — merge onto what we have */ }
      const merged = mergeAwardPicks(latest, draft, myColumn)
      await persist({ awards: merged })
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  const rows = editing ? draft : awards
  const dirty = editing && hasChanges(awards, draft, myColumn)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ fontSize: 11.5, color: 'var(--iff-subtext)', flex: 1 }}>
          One pick per host, per category.
          {myColumn
            ? ` You edit the ${myColumn} column; a blank leaves what's already there.`
            : ' Read-only — this account owns no column.'}
          {!stored && ` (Showing seeded ${POD_SEED_SEASON} data until you save an edit.)`}
        </div>
        {editing ? (
          <>
            <button className="btn-primary" onClick={save} disabled={saving || !dirty}
                    style={{ fontSize: 11, padding: '5px 12px', opacity: saving || !dirty ? 0.5 : 1 }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setEditing(false)} style={{ fontSize: 11, padding: '5px 12px', color: 'var(--iff-subtext)' }}>Cancel</button>
          </>
        ) : myColumn ? (
          <button className="btn-outline" onClick={startEdit} style={{ fontSize: 11, padding: '5px 12px' }}>Edit</button>
        ) : null}
      </div>

      <div className="iff-card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 520 }}>
          <thead>
            <tr style={{ color: 'var(--iff-subtext)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.4 }}>
              <th style={{ textAlign: 'left', padding: '10px 12px' }}>Category</th>
              {/* The three pick columns centre; Category stays left. */}
              {predictors.map((p) => <th key={p} style={{ textAlign: 'center', padding: '10px 8px' }}>{p}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((a, i) => (
              <tr key={a.category} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--iff-divider)' }}>
                <td style={{ padding: '9px 12px', fontWeight: 700 }}>{a.category}</td>
                {predictors.map((p) => (
                  <td key={p} style={{ padding: '9px 8px', textAlign: 'center' }}>
                    {/* Only your own column becomes an input. Everyone
                        else's stays behind its bar even while you edit —
                        editing your picks is not a reason to see theirs. */}
                    {editing && p === myColumn ? (
                      <input
                        value={draft[i].picks[p] ?? ''}
                        onChange={(e) => {
                          const next = [...draft]
                          next[i] = { ...next[i], picks: { ...next[i].picks, [p]: e.target.value } }
                          setDraft(next)
                        }}
                        style={{ width: '100%', minWidth: 120 }}
                      />
                    ) : (
                      <Spoiler
                        id={spoilerId(a.category, p)}
                        value={(editing ? awards[i] : a)?.picks?.[p]}
                        revealed={revealed}
                        onReveal={onReveal}
                        locked={editing}
                      />
                    )}
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

function BoldCallsModule({ pod, persist, revealed, onReveal }) {
  const { userTeam } = useApp()
  const stored = pod.boldCalls
  const calls = stored ?? POD_BOLD_CALLS_2025
  const hosts = Object.keys(calls)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)

  // Same rule as Awards: you own one card. Every host key here is also an
  // award column, so the mapping is reused rather than duplicated.
  const myHost = columnFor(userTeam, hosts)

  function startEdit() {
    setDraft(JSON.parse(JSON.stringify(calls)))
    setEditing(true)
  }
  async function save() {
    setSaving(true)
    try {
      // Merge onto a FRESH read — config/pod has no listener, so the copy
      // on screen can be minutes old and saving it reverts another host.
      let latest = calls
      try {
        const fresh = await fs.fetchPodContent()
        if (fresh?.boldCalls) latest = fresh.boldCalls
      } catch { /* offline or preview */ }
      await persist({ boldCalls: mergeBoldCalls(latest, draft, myHost) })
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  const data = editing ? draft : calls

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ fontSize: 11.5, color: 'var(--iff-subtext)', flex: 1 }}>
          Bold calls for the season — the ones we get to relitigate in December.
          {myHost
            ? ` You edit ${myHost}'s card; a blank leaves what's already there.`
            : ' Read-only — this account owns no card.'}
          {!stored && ` (Showing seeded ${POD_SEED_SEASON} data until you save an edit.)`}
        </div>
        {editing ? (
          <>
            <button className="btn-primary" onClick={save} disabled={saving}
                    style={{ fontSize: 11, padding: '5px 12px', opacity: saving ? 0.5 : 1 }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setEditing(false)} style={{ fontSize: 11, padding: '5px 12px', color: 'var(--iff-subtext)' }}>Cancel</button>
          </>
        ) : myHost ? (
          <button className="btn-outline" onClick={startEdit} style={{ fontSize: 11, padding: '5px 12px' }}>Edit</button>
        ) : null}
      </div>

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        {hosts.map((host) => (
          <div key={host} className="iff-card" style={{ padding: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8, color: 'var(--iff-gold)' }}>{host}</div>
            {(data[host] ?? []).map((call, i) => (
              <div key={i} style={{ marginBottom: 7 }}>
                {/* Only your own card becomes editable. The other two stay
                    behind their bars even while you edit — same rule as
                    Awards, and the reason `locked` exists. */}
                {editing && host === myHost ? (
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
                    {/* The number stays legible; only the call is covered. */}
                    <span style={{ color: 'var(--iff-subtext)', flexShrink: 0 }}>{i + 1}.</span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <Spoiler
                        id={spoilerId(host, i)}
                        value={editing ? (calls[host] ?? [])[i] : call}
                        revealed={revealed}
                        onReveal={onReveal}
                        blank=""
                        locked={editing}
                      />
                    </span>
                  </div>
                )}
              </div>
            ))}
            {editing && host === myHost && (
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
