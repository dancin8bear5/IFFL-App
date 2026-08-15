// AdminView — port of Views/AdminView.swift. Commissioner-only panel.
// Sections: Database, Players, Picks, Trades, Messages, Teams, Access.
import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { fantasyTeams, RULE_CATEGORIES } from '../data/staticData'
import { PosBadge, DetailOverlay, ChipScroller } from '../components/shared'
import * as fs from '../services/firestoreService'
import { parseKeeperCSV, diffKeeperImport } from '../services/keeperImport'
import { computeRolloverPlan } from '../services/seasonRollover'
import { tradeCapImpact } from '../services/contracts'
import TaxWarning from '../components/TaxWarning'
import { getFunctionsClient } from '../firebase'
import { httpsCallable } from 'firebase/functions'

const SECTIONS = ['Database', 'Keeper Import', 'Rollover', 'Areas', 'Rules', 'Records', 'Players', 'Drops', 'Picks', 'Trades', 'Messages', 'Teams', 'Access', 'GroupMe']

export default function AdminView() {
  const [section, setSection] = useState('Database')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--iff-divider)' }}>
        <ChipScroller>
          <div style={{ display: 'flex', gap: 8, width: 'max-content' }}>
            {SECTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setSection(s)}
                style={{
                  padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
                  background: s === section ? 'var(--iff-accent)' : 'var(--iff-elevated)',
                  color: s === section ? '#fff' : 'var(--iff-subtext)',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </ChipScroller>
      </div>

      <div style={{ padding: 14 }}>
        {section === 'Database' && <DatabaseSection />}
        {section === 'Keeper Import' && <KeeperImportSection />}
        {section === 'Rollover' && <RolloverSection />}
        {section === 'Areas' && <AreasSection />}
        {section === 'Rules' && <RulesAdminSection />}
        {section === 'Records' && <RecordsSection />}
        {section === 'Players' && <PlayersSection />}
        {section === 'Drops' && <DropsSection />}
        {section === 'Picks' && <PicksSection />}
        {section === 'Trades' && <TradesSection />}
        {section === 'Messages' && <MessagesSection />}
        {section === 'Teams' && <TeamsSection />}
        {section === 'Access' && <AccessSection />}
        {section === 'GroupMe' && <GroupMeSection />}
      </div>
    </div>
  )
}

// ── Database ──────────────────────────────────────────────────

function DatabaseSection() {
  const { players, draftPicks, trades, activeSeason, setActiveSeason, isOffSeason, setIsOffSeason } = useApp()
  const [seasonInput, setSeasonInput] = useState(String(activeSeason))
  const [busy, setBusy] = useState(false)
  const pendingCount = trades.filter((t) => t.status === 'proposed' || t.status === 'accepted').length

  async function toggleOffSeason() {
    const next = !isOffSeason
    setIsOffSeason(next)
    await fs.setOffSeason(next).catch(() => {})
  }

  async function saveSeason() {
    const year = Number(seasonInput)
    if (!year || year < 2020 || year > 2100) return
    setBusy(true)
    try {
      await fs.updateActiveSeasonYear(year).catch(() => {})
      setActiveSeason(year)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="iff-card" style={{ padding: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, textAlign: 'center' }}>
          <Stat value={players.length} label="Players" />
          <Stat value={draftPicks.length} label="Picks" />
          <Stat value={pendingCount} label="Pending Trades" />
        </div>
      </div>

      <div className="iff-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 14 }}>Off-Season Mode</span>
          <button
            role="switch"
            aria-checked={isOffSeason}
            onClick={toggleOffSeason}
            style={{
              width: 44, height: 26, borderRadius: 13, position: 'relative',
              background: isOffSeason ? '#22C55E' : 'var(--iff-elevated)', transition: 'background 0.15s',
            }}
          >
            <span style={{ position: 'absolute', top: 2, left: isOffSeason ? 20 : 2, width: 22, height: 22, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
          </button>
        </div>
        <hr className="divider" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14, flex: 1 }}>Active Season</span>
          <input
            type="number"
            value={seasonInput}
            onChange={(e) => setSeasonInput(e.target.value)}
            style={{ width: 90, textAlign: 'center' }}
          />
          <button className="btn-outline" onClick={saveSeason} disabled={busy} style={{ fontSize: 12, padding: '6px 14px' }}>
            Save
          </button>
        </div>
      </div>

      <div className="iff-card" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ flex: 1 }}>
          <span style={{ display: 'block', fontSize: 14 }}>2008 Season Shell</span>
          <span style={{ display: 'block', fontSize: 11, color: 'var(--iff-subtext)', marginTop: 2 }}>
            Champion: M. Zurek · standings to be seeded when full data arrives
          </span>
        </span>
        <button
          className="btn-outline"
          onClick={() =>
            fs.addSeasonHistory({ season: 2008, champion: 'M. Zurek', runnerUp: null, standings: [], notableTrades: [] })
              .then(() => alert('2008 shell added — champion M. Zurek. Standings can be filled in later.'))
              .catch((e) => alert(`Failed: ${e.message}`))
          }
          style={{ fontSize: 12, padding: '6px 14px' }}
        >
          Add 2008 Shell
        </button>
      </div>

      <div className="iff-card" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ flex: 1 }}>
          <span style={{ display: 'block', fontSize: 14 }}>Seed 2026 Rule Proposals</span>
          <span style={{ display: 'block', fontSize: 11, color: 'var(--iff-subtext)', marginTop: 2 }}>
            The ten proposals from Keeper Master p15, ready for voting day. Safe to re-run — updates
            in place, never duplicates or clears votes.
          </span>
        </span>
        <button
          className="btn-outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              const { proposals2026 } = await import('../data/rulebookSeed')
              const n = await fs.seedRuleProposals(proposals2026)
              alert(`Seeded ${n} proposal${n === 1 ? '' : 's'}. They're live in Rules now.`)
            } catch (e) {
              alert(`Failed: ${e.message}`)
            } finally {
              setBusy(false)
            }
          }}
          style={{ fontSize: 12, padding: '6px 14px' }}
        >
          Seed Proposals
        </button>
      </div>

      <div className="iff-card" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ flex: 1 }}>
          <span style={{ display: 'block', fontSize: 14 }}>Seed 2026 Rookie Class</span>
          <span style={{ display: 'block', fontSize: 11, color: 'var(--iff-subtext)', marginTop: 2 }}>
            All 24 picks from the Jul 16 rookie draft (Keeper Master p5) land on their teams —
            R1 at $2, R2 at $1 — and the spent 2026 pick assets retire. Safe to re-run; never
            duplicates. NFL teams start blank — fill them in under Players as rookies sign.
          </span>
        </span>
        <button
          className="btn-outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              const { rookieClass2026 } = await import('../data/rookieDraft2026')
              const r = await fs.seedRookieClass(rookieClass2026, 2026)
              alert(`Rookies: ${r.added} added, ${r.skipped} already existed. ${r.picksRetired} spent 2026 pick${r.picksRetired === 1 ? '' : 's'} retired.`)
            } catch (e) {
              alert(`Failed: ${e.message}`)
            } finally {
              setBusy(false)
            }
          }}
          style={{ fontSize: 12, padding: '6px 14px' }}
        >
          Seed Rookies
        </button>
      </div>

      <ValidateContractsCard players={players} />

      <div style={{ fontSize: 11, color: 'var(--iff-subtext)', lineHeight: 1.6, padding: '0 4px' }}>
        Bulk seeding (full player list, NFL teams, league history) runs from the iOS admin panel or
        a server script — not from the web app.
      </div>
    </div>
  )
}

/**
 * Validate Contracts — run every player's stored price map against the
 * escalation formula (next = current + $5 × contract year) and repair
 * drift in one click.
 */
function ValidateContractsCard({ players }) {
  const [report, setReport] = useState(null) // {clean, problems:[{player, issues, repaired}]}
  const [busy, setBusy] = useState(false)

  async function run() {
    const { validatePrices, repairedPrices } = await import('../services/contracts')
    const problems = []
    for (const p of players) {
      const issues = validatePrices(p)
      if (issues.length) problems.push({ player: p, issues, repaired: repairedPrices(p) })
    }
    setReport({ clean: players.length - problems.length, problems })
  }

  async function repairAll() {
    if (!report?.problems.length) return
    setBusy(true)
    try {
      await fs.repairPlayerPrices(
        report.problems.map((x) => ({
          id: x.player.id, prices: x.repaired, name: x.player.name, teamName: x.player.teamName,
        })),
      )
      alert(`Repaired ${report.problems.length} player${report.problems.length === 1 ? '' : 's'}.`)
      setReport(null)
    } catch (e) {
      alert(`Failed: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="iff-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ flex: 1 }}>
          <span style={{ display: 'block', fontSize: 14 }}>Validate Contracts</span>
          <span style={{ display: 'block', fontSize: 11, color: 'var(--iff-subtext)', marginTop: 2 }}>
            Checks every stored price against next = current + $5 × contract year.
          </span>
        </span>
        <button className="btn-outline" onClick={run} style={{ fontSize: 12, padding: '6px 14px' }}>
          Run Check
        </button>
      </div>

      {report && (
        <>
          <hr className="divider" />
          {report.problems.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--iff-green)', fontWeight: 700 }}>
              ✓ All {report.clean} players match the formula.
            </div>
          ) : (
            <>
              <div style={{ fontSize: 12, color: 'var(--iff-accent)', fontWeight: 700 }}>
                {report.problems.length} player{report.problems.length === 1 ? '' : 's'} drifted · {report.clean} clean
              </div>
              <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {report.problems.map(({ player, issues }) => (
                  <div key={player.id} style={{ fontSize: 11.5, background: 'var(--iff-elevated)', borderRadius: 8, padding: '7px 10px' }}>
                    <span style={{ fontWeight: 700 }}>{player.name}</span>
                    <span style={{ color: 'var(--iff-subtext)' }}> ({player.teamName}) — </span>
                    {issues.map((i) => `${i.season}: $${i.stored} should be $${i.expected}`).join(' · ')}
                  </div>
                ))}
              </div>
              <button className="btn-primary" onClick={repairAll} disabled={busy} style={{ fontSize: 12, padding: '8px 14px' }}>
                {busy ? 'Repairing…' : `Repair All (${report.problems.length})`}
              </button>
            </>
          )}
        </>
      )}
    </div>
  )
}

function Stat({ value, label }) {
  return (
    <div>
      <div className="tnum" style={{ fontSize: 20, fontWeight: 800, color: 'var(--iff-gold)' }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--iff-subtext)' }}>{label}</div>
    </div>
  )
}

// ── Keeper Import — the once-a-year keeper-deadline reconciliation ────
// Paste or upload the Keeper Master CSV export; preview a diff against the
// live roster; apply. Replaces hand-typing keeper elections one at a time.

function KeeperImportSection() {
  const { players, activeSeason } = useApp()
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState(null)
  const [parsed, setParsed] = useState(null) // {rows, pickRows, errors}
  const [diff, setDiff] = useState(null)
  const [expand, setExpand] = useState(null) // 'added' | 'changed' | 'missing' | null
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  function onFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = () => setText(String(reader.result ?? ''))
    reader.readAsText(file)
    e.target.value = ''
  }

  function preview() {
    setResult(null)
    const p = parseKeeperCSV(text, activeSeason)
    setParsed(p)
    if (p.rows.length === 0) { setDiff(null); return }
    setDiff(diffKeeperImport(p.rows, players, activeSeason))
  }

  async function apply() {
    if (!diff || (diff.added.length === 0 && diff.changed.length === 0)) return
    if (!confirm(`Write ${diff.added.length} new player${diff.added.length === 1 ? '' : 's'} and ${diff.changed.length} update${diff.changed.length === 1 ? '' : 's'}? This can't be bulk-undone.`)) return
    setBusy(true)
    try {
      const r = await fs.applyKeeperImport(diff, { season: activeSeason })
      setResult(r)
      setDiff(null)
      setParsed(null)
      setText('')
    } catch (e) {
      alert(`Import failed: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 11.5, color: 'var(--iff-subtext)', lineHeight: 1.6, padding: '0 4px' }}>
        The once-a-year bulk step for the keeper deadline. Paste or upload the Keeper Master CSV
        export (Team, Position, Player, {activeSeason} Price, {activeSeason + 1} Price,
        {' '}{activeSeason + 2} Price, Original Price, Purchase Year, Contract Year, Player Pool).
        Preview shows exactly what changes before anything writes — new players, price/team drift,
        and anyone in the app who's missing from the sheet. Draft Pick rows are skipped; picks
        reconcile separately. Re-running the same sheet is always safe — it only ever updates.
      </div>

      <div className="iff-card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <label className="btn-outline" style={{ fontSize: 12, padding: '7px 16px', cursor: 'pointer' }}>
            Upload CSV
            <input type="file" accept=".csv,text/csv" onChange={onFile} style={{ display: 'none' }} />
          </label>
          {fileName && <span style={{ fontSize: 11, color: 'var(--iff-subtext)' }}>{fileName}</span>}
          <span style={{ fontSize: 11, color: 'var(--iff-subtext)' }}>or paste below</span>
        </div>
        <textarea
          rows={6}
          placeholder="Team,Position,Player,2026 Price,2027 Price,2028 Price,Original Price,Purchase Year,Contract Year,Player Pool&#10;Jared,QB,Patrick Mahomes,$85,$105,$130,$70,2023,4,Auction"
          value={text}
          onChange={(e) => setText(e.target.value)}
          style={{ fontFamily: 'monospace', fontSize: 11, resize: 'vertical' }}
        />
        <button className="btn-primary" onClick={preview} disabled={!text.trim()} style={{ alignSelf: 'flex-start', padding: '8px 20px', fontSize: 13 }}>
          Preview Import
        </button>
      </div>

      {result && (
        <div className="iff-card" style={{ padding: 14, border: '1.5px solid rgba(74,222,128,0.5)', background: 'linear-gradient(135deg, rgba(74,222,128,0.12), var(--iff-surface) 60%)' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--iff-green)' }}>✓ Import applied</div>
          <div style={{ fontSize: 11.5, color: 'var(--iff-subtext)', marginTop: 3 }}>
            {result.added} new player{result.added === 1 ? '' : 's'} added, {result.changed} updated. Logged to the transaction ledger.
          </div>
        </div>
      )}

      {parsed && parsed.errors.length > 0 && (
        <div className="iff-card" style={{ padding: 14, border: '1px solid rgba(239,68,68,0.4)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#EF4444', marginBottom: 6 }}>
            {parsed.errors.length} row{parsed.errors.length === 1 ? '' : 's'} skipped
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {parsed.errors.slice(0, 12).map((e, i) => (
              <div key={i} style={{ fontSize: 10.5, color: 'var(--iff-subtext)' }}>Line {e.line}: {e.message}</div>
            ))}
            {parsed.errors.length > 12 && (
              <div style={{ fontSize: 10.5, color: 'var(--iff-subtext)' }}>…and {parsed.errors.length - 12} more</div>
            )}
          </div>
        </div>
      )}

      {diff && (
        <>
          {diff.overCap.length > 0 && (
            <div className="iff-card" style={{ padding: 14, border: '1.5px solid rgba(230,57,70,0.5)', background: 'linear-gradient(135deg, rgba(230,57,70,0.12), var(--iff-surface) 60%)' }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--iff-accent)' }}>⚠ Over the $300 cap in this sheet</div>
              {diff.overCap.map((t) => (
                <div key={t.team} className="tnum" style={{ fontSize: 11.5, marginTop: 4 }}>
                  {t.team}: <strong style={{ color: 'var(--iff-accent)' }}>${t.total}</strong>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            <SummaryTile label="New" count={diff.added.length} color="var(--iff-green)" onClick={() => setExpand(expand === 'added' ? null : 'added')} active={expand === 'added'} />
            <SummaryTile label="Changed" count={diff.changed.length} color="var(--iff-gold)" onClick={() => setExpand(expand === 'changed' ? null : 'changed')} active={expand === 'changed'} />
            <SummaryTile label="Unchanged" count={diff.unchanged.length} color="var(--iff-subtext)" />
            <SummaryTile label="Missing" count={diff.missing.length} color="#EF4444" onClick={() => setExpand(expand === 'missing' ? null : 'missing')} active={expand === 'missing'} />
          </div>

          {expand === 'added' && (
            <DiffList
              rows={diff.added}
              render={(r) => `${r.team} — ${r.name} (${r.position}) · $${r.prices[activeSeason] ?? 0}`}
            />
          )}
          {expand === 'changed' && (
            <DiffList
              rows={diff.changed}
              render={(r) => `${r.team} — ${r.name}: ${r.changedFields.join(', ')}`}
            />
          )}
          {expand === 'missing' && (
            <>
              <div style={{ fontSize: 10.5, color: 'var(--iff-subtext)', padding: '0 2px' }}>
                On a roster in the app but not in this sheet. Not touched automatically — deactivate
                manually under Players if they're really gone.
              </div>
              <DiffList rows={diff.missing} render={(r) => `${r.teamName} — ${r.name}`} />
            </>
          )}

          <button
            className="btn-primary"
            onClick={apply}
            disabled={busy || (diff.added.length === 0 && diff.changed.length === 0)}
            style={{ background: '#16A34A' }}
          >
            {busy ? 'Applying…' : `Apply — ${diff.added.length + diff.changed.length} write${diff.added.length + diff.changed.length === 1 ? '' : 's'}`}
          </button>
        </>
      )}
    </div>
  )
}

function SummaryTile({ label, count, color, onClick, active }) {
  const El = onClick ? 'button' : 'div'
  return (
    <El
      onClick={onClick}
      className="iff-card"
      style={{
        padding: '10px 8px', textAlign: 'center',
        outline: active ? `2px solid ${color}` : 'none',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <div className="tnum" style={{ fontSize: 20, fontWeight: 900, color }}>{count}</div>
      <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--iff-subtext)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 }}>{label}</div>
    </El>
  )
}

function DiffList({ rows, render }) {
  if (rows.length === 0) return null
  return (
    <div className="iff-card" style={{ padding: 0, overflow: 'hidden', maxHeight: 260, overflowY: 'auto' }}>
      {rows.map((r, i) => (
        <div key={i} style={{ padding: '8px 12px', fontSize: 11.5, borderTop: i ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
          {render(r)}
        </div>
      ))}
    </div>
  )
}

// ── Season Rollover — the guided routine for the day after the season
// ends. Built and fully previewable, but disarmed by default: arming and
// applying are two separate deliberate actions, and a successful apply
// auto-disarms so the same arm can't fire twice by accident.

function RolloverSection() {
  const { players, activeSeason, leagueHistory, rolloverArmed, armRollover } = useApp()
  const [confirmText, setConfirmText] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  const toSeason = activeSeason + 1
  const plan = useMemo(
    () => computeRolloverPlan(players, toSeason, leagueHistory.map((h) => h.season)),
    [players, toSeason, leagueHistory],
  )
  const expectedConfirm = `${plan.fromSeason}→${plan.toSeason}`
  const canApply = rolloverArmed && confirmText.trim() === expectedConfirm

  async function apply() {
    if (!canApply) return
    setBusy(true)
    try {
      const r = await fs.applyRollover(plan, {})
      setResult(r)
      setConfirmText('')
    } catch (e) {
      alert(`Rollover failed: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 11.5, color: 'var(--iff-subtext)', lineHeight: 1.6, padding: '0 4px' }}>
        The once-a-year routine for the day after the season ends: extends every rostered player's
        price map one more year, generates next year's 24 rookie picks ($2 R1 / $1 R2, unslotted),
        and advances the active season. Dropped-pending and cleared players are skipped — resolve
        those first. This does <b>not</b> touch league history or standings — ESPN owns final
        results, so that stays a manual step.
      </div>

      <div
        className="iff-card"
        style={{
          padding: 14, display: 'flex', alignItems: 'center', gap: 12,
          border: rolloverArmed ? '1.5px solid rgba(230,57,70,0.5)' : '1px solid rgba(74,222,128,0.35)',
          background: rolloverArmed
            ? 'linear-gradient(135deg, rgba(230,57,70,0.14), var(--iff-surface) 60%)'
            : 'linear-gradient(135deg, rgba(74,222,128,0.1), var(--iff-surface) 60%)',
        }}
      >
        <span style={{ fontSize: 20 }}>{rolloverArmed ? '🔓' : '🔒'}</span>
        <span style={{ flex: 1 }}>
          <span style={{ display: 'block', fontSize: 13.5, fontWeight: 800 }}>
            {rolloverArmed ? 'Armed — apply is live' : 'Disarmed (default)'}
          </span>
          <span style={{ display: 'block', fontSize: 11, color: 'var(--iff-subtext)', marginTop: 2 }}>
            {rolloverArmed
              ? 'The preview below is only a plan until you type the confirmation and apply.'
              : "Nothing below can be applied until you arm it. Leave this off until the season is actually over."}
          </span>
        </span>
        <button
          role="switch"
          aria-checked={rolloverArmed}
          aria-label="Arm rollover"
          onClick={() => armRollover(!rolloverArmed)}
          style={{
            width: 44, height: 26, borderRadius: 13, position: 'relative', flexShrink: 0,
            background: rolloverArmed ? '#DC2626' : 'var(--iff-elevated)', transition: 'background 0.15s',
          }}
        >
          <span style={{ position: 'absolute', top: 2, left: rolloverArmed ? 20 : 2, width: 22, height: 22, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
        </button>
      </div>

      {result && (
        <div className="iff-card" style={{ padding: 14, border: '1.5px solid rgba(74,222,128,0.5)', background: 'linear-gradient(135deg, rgba(74,222,128,0.12), var(--iff-surface) 60%)' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--iff-green)' }}>✓ Rolled to {toSeason}</div>
          <div style={{ fontSize: 11.5, color: 'var(--iff-subtext)', marginTop: 3 }}>
            {result.playersUpdated} player{result.playersUpdated === 1 ? '' : 's'} updated, {result.picksGenerated} picks generated. Rollover auto-disarmed.
          </div>
        </div>
      )}

      <div style={{ fontSize: 15, fontWeight: 800 }}>{plan.fromSeason} → {plan.toSeason}</div>

      {plan.historyReminder && (
        <div className="iff-card" style={{ padding: 12, fontSize: 11.5, color: 'var(--iff-gold)', border: '1px solid rgba(244,162,97,0.4)' }}>
          ⚠ {plan.fromSeason} isn't in League History yet — seed final standings under Database
          before or after rolling over.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        <SummaryTile label="Price maps extended" count={plan.priceUpdates.length} color="var(--iff-green)" />
        <SummaryTile label="New picks" count={plan.newPicks.length} color="var(--iff-gold)" />
        <SummaryTile label="Skipped" count={plan.skipped.length} color="#EF4444" />
      </div>

      {plan.skipped.length > 0 && (
        <>
          <div style={{ fontSize: 10.5, color: 'var(--iff-subtext)', padding: '0 2px' }}>
            Resolve these via Drops or Keeper Import before applying — rollover leaves them untouched.
          </div>
          <DiffList rows={plan.skipped} render={(r) => `${r.teamName} — ${r.name}: ${r.reason}`} />
        </>
      )}

      <div style={{ fontSize: 10.5, color: 'var(--iff-subtext)', padding: '0 2px' }}>
        {plan.newPicks.length} picks for {plan.toSeason + 1}, 2 per team (R1 $2, R2 $1).
      </div>

      <div className="iff-card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 12, color: 'var(--iff-subtext)' }}>
          Type <strong className="tnum" style={{ color: 'var(--iff-text)' }}>{expectedConfirm}</strong> to enable Apply.
        </div>
        <input
          type="text"
          placeholder={expectedConfirm}
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          disabled={!rolloverArmed}
          style={{ maxWidth: 200 }}
        />
        <button
          className="btn-primary"
          onClick={apply}
          disabled={!canApply || busy}
          style={{ background: canApply ? '#16A34A' : undefined }}
        >
          {busy ? 'Applying…' : !rolloverArmed ? 'Arm above to enable' : `Apply Rollover — ${plan.priceUpdates.length + plan.newPicks.length} writes`}
        </button>
      </div>
    </div>
  )
}

// ── Areas — league-wide kill-switches for tabs and app sections ──

const APP_AREAS = [
  { group: 'Tabs', items: [
    { key: 'rosters', label: 'Rosters tab', glyph: '👥' },
    { key: 'players', label: 'Players tab', glyph: '🔎' },
    { key: 'market',  label: 'Market tab (FMK, matches, trades)', glyph: '⇄' },
    { key: 'builder', label: 'Team Builder tab', glyph: '🧪' },
  ]},
  { group: 'Dashboard sections', items: [
    { key: 'rules',    label: 'Rules & proposals', glyph: '📜' },
    { key: 'parlay',   label: 'Low Points Parlay', glyph: '🎯' },
    { key: 'ledger',   label: 'Transaction Log', glyph: '🧾' },
    { key: 'history',  label: 'Trophy Room & history tiles', glyph: '🏆' },
    { key: 'messages', label: 'League messages', glyph: '💬' },
  ]},
]

function AreasSection() {
  const { disabledAreas, toggleArea } = useApp()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 11.5, color: 'var(--iff-subtext)', lineHeight: 1.6, padding: '0 4px' }}>
        Switch any tab or app section off for the whole league — hidden tabs vanish from
        everyone's navigation instantly. You (admin) always see everything, so you can flip an
        area back on. Dashboard itself can't be disabled.
      </div>
      {APP_AREAS.map((g) => (
        <div key={g.group} className="iff-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '11px 14px', fontSize: 12.5, fontWeight: 800, borderBottom: '1px solid var(--iff-divider)' }}>
            {g.group}
          </div>
          {g.items.map((a, i) => {
            const on = !disabledAreas.has(a.key)
            return (
              <div key={a.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderTop: i ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                <span style={{ fontSize: 15 }}>{a.glyph}</span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, opacity: on ? 1 : 0.55 }}>
                  {a.label}
                  {!on && <span style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--iff-accent)', marginLeft: 8 }}>HIDDEN</span>}
                </span>
                <button
                  role="switch"
                  aria-checked={on}
                  aria-label={a.label}
                  onClick={() => toggleArea(a.key)}
                  style={{
                    width: 44, height: 26, borderRadius: 13, position: 'relative', flexShrink: 0,
                    background: on ? '#22C55E' : 'var(--iff-elevated)', transition: 'background 0.15s',
                  }}
                >
                  <span style={{ position: 'absolute', top: 2, left: on ? 20 : 2, width: 22, height: 22, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
                </button>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// ── Rules — commissioner manual entry ─────────────────────────
// Full control the member proposal form doesn't give: any status
// (standing rule, passed, failed, proposed), decided season, proposer.

const RULE_STATUSES = [
  { key: 'passed',   label: 'Passed',   note: 'shows under New Rules for its season' },
  { key: 'proposed', label: 'Proposed', note: 'goes on the ballot like a member proposal' },
  { key: 'failed',   label: 'Failed',   note: 'archived under Past Rules' },
]

const EMPTY_RULE = {
  title: '', category: 'Operations', summary: '', proposedBy: 'Commissioner',
  status: 'passed', decidedSeason: '', changes: [{ rule: '', currentValue: '', newValue: '' }],
}

function RulesAdminSection() {
  const { rules, activeSeason } = useApp()
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const setChange = (i, patch) =>
    setForm((f) => ({ ...f, changes: f.changes.map((row, idx) => (idx === i ? { ...row, ...patch } : row)) }))

  const openNew = () => setForm({ ...EMPTY_RULE, decidedSeason: String(activeSeason) })
  const openEdit = (r) =>
    setForm({
      ...EMPTY_RULE,
      ...r,
      decidedSeason: r.decidedSeason ? String(r.decidedSeason) : String(activeSeason),
      changes: r.changes?.length ? r.changes : [{ rule: '', currentValue: '', newValue: '' }],
    })

  async function save() {
    if (!form.title.trim()) return
    setBusy(true)
    try {
      const { id, ...rest } = form
      const payload = {
        ...rest,
        title: form.title.trim(),
        summary: form.summary.trim(),
        proposedBy: form.proposedBy.trim() || 'Commissioner',
        changes: form.changes.filter((c) => c.rule.trim() || c.newValue.trim()),
        decidedSeason: form.status === 'proposed' ? null : Number(form.decidedSeason) || activeSeason,
      }
      await fs.saveRule(id ? { id, ...payload } : payload)
      setForm(null) // the rules listener refreshes the list
    } catch (e) {
      alert(`Failed: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  async function remove(rule) {
    if (!confirm(`Delete rule "${rule.title}"? This removes it for the whole league.`)) return
    await fs.deleteRule(rule.id).catch((e) => alert(`Failed: ${e.message}`))
  }

  const groups = [
    { label: `New Rules — ${activeSeason}`, items: rules.filter((r) => r.status === 'passed' && r.decidedSeason === activeSeason) },
    { label: 'On the Ballot', items: rules.filter((r) => r.status === 'proposed') },
    { label: 'Past / Other', items: rules.filter((r) => !(r.status === 'passed' && r.decidedSeason === activeSeason) && r.status !== 'proposed') },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 11.5, color: 'var(--iff-subtext)', lineHeight: 1.6, padding: '0 4px' }}>
        Enter rules directly — set them straight to <b>Passed</b> for a season (standing rules,
        decisions made outside the app), put them on the ballot, or fix anything a member submitted.
      </div>

      <button className="btn-primary" onClick={openNew} style={{ alignSelf: 'flex-start', padding: '10px 20px', fontSize: 14 }}>
        ＋ Add Rule
      </button>

      {groups.map((g) => (
        <div key={g.label} className="iff-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '11px 14px', fontSize: 13, fontWeight: 800, borderBottom: '1px solid var(--iff-divider)' }}>
            {g.label} ({g.items.length})
          </div>
          {g.items.length === 0 && <div style={{ padding: 14, fontSize: 12, color: 'var(--iff-subtext)' }}>None.</div>}
          {g.items.map((r, i) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderTop: i ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.title}
                </span>
                <span style={{ display: 'block', fontSize: 10.5, color: 'var(--iff-subtext)' }}>
                  {r.category ?? 'Operations'} · {r.status}{r.decidedSeason ? ` ${r.decidedSeason}` : ''} · {r.proposedBy}
                </span>
              </span>
              <button className="btn-outline" onClick={() => openEdit(r)} style={{ fontSize: 11, padding: '5px 12px' }}>
                Edit
              </button>
              <button onClick={() => remove(r)} style={{ fontSize: 12, color: '#EF4444', padding: '5px 8px' }} aria-label={`Delete ${r.title}`}>
                ✕
              </button>
            </div>
          ))}
        </div>
      ))}

      {form && (
        <DetailOverlay title={form.id ? 'Edit Rule' : 'Add Rule'} onBack={() => setForm(null)}>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Field label="Title">
              <input type="text" placeholder="e.g. 0.5 PPR at every position" value={form.title} onChange={(e) => set({ title: e.target.value })} />
            </Field>

            <Field label="Category">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {RULE_CATEGORIES.map((c) => {
                  const active = form.category === c.key
                  return (
                    <button
                      key={c.key}
                      onClick={() => set({ category: c.key })}
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

            <Field label="Status">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {RULE_STATUSES.map((s) => {
                  const active = form.status === s.key
                  return (
                    <button
                      key={s.key}
                      onClick={() => set({ status: s.key })}
                      style={{
                        padding: '7px 14px', borderRadius: 18, fontSize: 12, fontWeight: 700,
                        background: active ? 'var(--iff-accent)' : 'var(--iff-elevated)',
                        color: active ? '#fff' : 'var(--iff-subtext)',
                      }}
                    >
                      {s.label}
                    </button>
                  )
                })}
              </div>
              <div style={{ fontSize: 10, color: 'var(--iff-subtext)', marginTop: 5 }}>
                {RULE_STATUSES.find((s) => s.key === form.status)?.note}
              </div>
            </Field>

            {form.status !== 'proposed' && (
              <Field label="Season decided">
                <input
                  type="number" className="tnum" value={form.decidedSeason}
                  onChange={(e) => set({ decidedSeason: e.target.value })}
                  style={{ maxWidth: 120 }}
                />
              </Field>
            )}

            <Field label="Summary">
              <textarea
                rows={3}
                placeholder="What the rule is and why it exists."
                value={form.summary}
                onChange={(e) => set({ summary: e.target.value })}
                style={{ resize: 'vertical' }}
              />
            </Field>

            <div>
              <div style={{ fontSize: 12, color: 'var(--iff-subtext)', marginBottom: 6 }}>Rule Changes (optional)</div>
              <div className="iff-card" style={{ overflow: 'hidden' }}>
                {form.changes.map((c, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) 1fr 1fr 26px', gap: 6, padding: '7px 10px', alignItems: 'center', borderTop: i ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                    <input type="text" placeholder="Rule" value={c.rule} onChange={(e) => setChange(i, { rule: e.target.value })} style={{ fontSize: 12, padding: '7px 8px' }} />
                    <input type="text" placeholder="Current" value={c.currentValue} onChange={(e) => setChange(i, { currentValue: e.target.value })} style={{ fontSize: 12, padding: '7px 8px', textAlign: 'center' }} />
                    <input type="text" placeholder="New" value={c.newValue} onChange={(e) => setChange(i, { newValue: e.target.value })} style={{ fontSize: 12, padding: '7px 8px', textAlign: 'center' }} />
                    <button
                      onClick={() => set({ changes: form.changes.length === 1 ? form.changes : form.changes.filter((_, idx) => idx !== i) })}
                      aria-label="Remove change row"
                      style={{ color: 'var(--iff-subtext)', fontSize: 13, textAlign: 'center' }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => set({ changes: [...form.changes, { rule: '', currentValue: '', newValue: '' }] })}
                  style={{ width: '100%', padding: '9px 10px', fontSize: 12, fontWeight: 700, color: 'var(--iff-gold)', textAlign: 'left', borderTop: '1px solid var(--iff-divider)' }}
                >
                  ＋ Add another rule change
                </button>
              </div>
            </div>

            <Field label="Proposed / entered by">
              <input type="text" value={form.proposedBy} onChange={(e) => set({ proposedBy: e.target.value })} style={{ maxWidth: 220 }} />
            </Field>

            <button className="btn-primary" onClick={save} disabled={busy || !form.title.trim()}>
              {busy ? 'Saving…' : form.id ? 'Save Changes' : 'Add Rule'}
            </button>
          </div>
        </DetailOverlay>
      )}
    </div>
  )
}

// ── Records — game & player extremes for the Trophy Room ──────
// Structure built ahead of the data: enter records as they're gathered
// going forward (weekly scores, player games, draft bargains…).

const RECORD_PRESETS = {
  game: [
    { label: 'Highest Single-Game Score', tone: 'high' },
    { label: 'Lowest Single-Game Score', tone: 'low' },
    { label: 'Biggest Blowout', tone: 'high' },
    { label: 'Closest Margin', tone: 'high' },
    { label: 'Most Combined Points', tone: 'high' },
    { label: 'Highest Score in a Loss', tone: 'low' },
    { label: 'Lowest Score in a Win', tone: 'high' },
  ],
  player: [
    { label: 'Best Player Game', tone: 'high' },
    { label: 'Most Season Points (Player)', tone: 'high' },
    { label: 'Best Draft Bargain', tone: 'high' },
    { label: 'Biggest Bust', tone: 'low' },
    { label: 'Most Points Left on Bench (Week)', tone: 'low' },
  ],
}

const EMPTY_RECORD = { scope: 'game', label: '', team: '', player: '', value: '', detail: '', season: '', week: '', tone: 'high' }

function RecordsSection() {
  const { leagueRecords, loadLeagueRecords, setLeagueRecords } = useApp()
  const [form, setForm] = useState(null) // record being edited, or null
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    loadLeagueRecords()
  }, [loadLeagueRecords])

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  async function save() {
    if (!form.label.trim()) return
    setBusy(true)
    try {
      const payload = {
        ...form,
        label: form.label.trim(),
        team: form.team || null,
        player: form.player.trim() || null,
        value: form.value.trim() || null,
        detail: form.detail.trim() || null,
        season: form.season ? Number(form.season) : null,
        week: form.week ? Number(form.week) : null,
      }
      const id = await fs.saveLeagueRecord(payload)
      setLeagueRecords((prev) => {
        const next = prev.filter((r) => r.id !== id)
        return [...next, { ...payload, id }].sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
      })
      setForm(null)
    } catch (e) {
      alert(`Failed: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  async function remove(record) {
    if (!confirm(`Delete "${record.label}"?`)) return
    await fs.deleteLeagueRecord(record.id).catch((e) => alert(`Failed: ${e.message}`))
    setLeagueRecords((prev) => prev.filter((r) => r.id !== record.id))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 11.5, color: 'var(--iff-subtext)', lineHeight: 1.6, padding: '0 4px' }}>
        Game and player extremes shown in the Trophy Room. Enter them as the data gets gathered —
        weekly scores, player games, draft results.
      </div>

      <button className="btn-primary" onClick={() => setForm(EMPTY_RECORD)} style={{ alignSelf: 'flex-start', padding: '10px 20px', fontSize: 14 }}>
        ＋ Add Record
      </button>

      {['game', 'player'].map((scope) => {
        const mine = leagueRecords.filter((r) => r.scope === scope)
        return (
          <div key={scope} className="iff-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '11px 14px', fontSize: 13, fontWeight: 800, borderBottom: '1px solid var(--iff-divider)', textTransform: 'capitalize' }}>
              {scope} extremes ({mine.length})
            </div>
            {mine.length === 0 && (
              <div style={{ padding: 16, fontSize: 12, color: 'var(--iff-subtext)' }}>None yet.</div>
            )}
            {mine.map((r, i) => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderTop: i ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700 }}>{r.label}</span>
                  <span style={{ display: 'block', fontSize: 10.5, color: r.tone === 'low' ? '#F87171' : 'var(--iff-green)' }}>
                    {[r.team, r.player, r.value].filter(Boolean).join(' — ')}
                    {r.season ? ` · ${r.season}` : ''}{r.week ? ` Wk ${r.week}` : ''}
                  </span>
                </span>
                <button className="btn-outline" onClick={() => setForm({ ...EMPTY_RECORD, ...r })} style={{ fontSize: 11, padding: '5px 12px' }}>
                  Edit
                </button>
                <button onClick={() => remove(r)} style={{ fontSize: 12, color: '#EF4444', padding: '5px 8px' }} aria-label={`Delete ${r.label}`}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        )
      })}

      {form && (
        <DetailOverlay title={form.id ? 'Edit Record' : 'Add Record'} onBack={() => setForm(null)}>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Field label="Scope">
              <div style={{ display: 'flex', gap: 8 }}>
                {['game', 'player'].map((s) => (
                  <button
                    key={s}
                    onClick={() => set({ scope: s })}
                    style={{
                      padding: '7px 16px', borderRadius: 18, fontSize: 12, fontWeight: 700, textTransform: 'capitalize',
                      background: form.scope === s ? 'var(--iff-accent)' : 'var(--iff-elevated)',
                      color: form.scope === s ? '#fff' : 'var(--iff-subtext)',
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Record">
              <select
                value={RECORD_PRESETS[form.scope].some((p) => p.label === form.label) ? form.label : '__custom'}
                onChange={(e) => {
                  const preset = RECORD_PRESETS[form.scope].find((p) => p.label === e.target.value)
                  if (preset) set({ label: preset.label, tone: preset.tone })
                }}
              >
                <option value="__custom">Custom…</option>
                {RECORD_PRESETS[form.scope].map((p) => (
                  <option key={p.label} value={p.label}>{p.label}</option>
                ))}
              </select>
              <input
                type="text" placeholder="Record name" value={form.label}
                onChange={(e) => set({ label: e.target.value })}
                style={{ marginTop: 6 }}
              />
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Team">
                <select value={form.team} onChange={(e) => set({ team: e.target.value })}>
                  <option value="">—</option>
                  {fantasyTeams.map((t) => (
                    <option key={t.name} value={t.name}>{t.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Player (optional)">
                <input type="text" placeholder="e.g. Saquon Barkley" value={form.player} onChange={(e) => set({ player: e.target.value })} />
              </Field>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 0.7fr', gap: 10 }}>
              <Field label="Value">
                <input type="text" placeholder="e.g. 212.4 pts" value={form.value} onChange={(e) => set({ value: e.target.value })} />
              </Field>
              <Field label="Season">
                <input type="number" placeholder="2026" value={form.season} onChange={(e) => set({ season: e.target.value })} className="tnum" />
              </Field>
              <Field label="Week">
                <input type="number" placeholder="—" value={form.week} onChange={(e) => set({ week: e.target.value })} className="tnum" />
              </Field>
            </div>

            <Field label="Detail (optional)">
              <input type="text" placeholder="e.g. vs Bill, in the snow game" value={form.detail} onChange={(e) => set({ detail: e.target.value })} />
            </Field>

            <Field label="Tone">
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => set({ tone: 'high' })}
                  style={{ padding: '7px 16px', borderRadius: 18, fontSize: 12, fontWeight: 700, background: form.tone === 'high' ? 'rgba(74,222,128,0.2)' : 'var(--iff-elevated)', color: form.tone === 'high' ? 'var(--iff-green)' : 'var(--iff-subtext)' }}
                >
                  Glory (green)
                </button>
                <button
                  onClick={() => set({ tone: 'low' })}
                  style={{ padding: '7px 16px', borderRadius: 18, fontSize: 12, fontWeight: 700, background: form.tone === 'low' ? 'rgba(248,113,113,0.2)' : 'var(--iff-elevated)', color: form.tone === 'low' ? '#F87171' : 'var(--iff-subtext)' }}
                >
                  Shame (red)
                </button>
              </div>
            </Field>

            <button className="btn-primary" onClick={save} disabled={busy || !form.label.trim()}>
              {busy ? 'Saving…' : 'Save Record'}
            </button>
          </div>
        </DetailOverlay>
      )}
    </div>
  )
}

// ── Players ───────────────────────────────────────────────────

const EMPTY_PLAYER = {
  name: '', position: 'QB', teamName: fantasyTeams[0].name, playerPool: 'Auction',
  purchaseYear: 2026, contractYearsRemaining: 1, originalPrice: 0,
  prices: { 2026: 0, 2027: 0, 2028: 0 }, tradeHistory: [], isActive: true, acquiredSeason: 2026,
}

function PlayersSection() {
  const { players, activeSeason } = useApp()
  const [editing, setEditing] = useState(null) // player object or 'new'
  const sorted = useMemo(
    () => [...players].sort((a, b) => (b.prices?.[String(activeSeason)] ?? 0) - (a.prices?.[String(activeSeason)] ?? 0)),
    [players, activeSeason],
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <button className="btn-primary" onClick={() => setEditing('new')} style={{ alignSelf: 'flex-start', padding: '10px 20px', fontSize: 14 }}>
        ＋ Add Player
      </button>
      <div className="iff-card">
        {sorted.map((p, i) => (
          <button
            key={p.id}
            onClick={() => setEditing(p)}
            style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '10px 14px', borderBottom: i < sorted.length - 1 ? '1px solid var(--iff-divider)' : 'none' }}
          >
            <PosBadge position={p.position} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>{p.name}</span>
              <span style={{ display: 'block', fontSize: 10, color: 'var(--iff-subtext)' }}>{p.teamName}</span>
            </span>
            <span className="tnum green" style={{ fontSize: 13, fontWeight: 700 }}>
              ${p.prices?.[String(activeSeason)] ?? 0}
            </span>
          </button>
        ))}
      </div>
      {editing && <PlayerEditOverlay player={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

// ── Drops — the in-season lifecycle (drop → 2-auction clock → claim/clear) ──

function DropsSection() {
  const { players, activeSeason, user } = useApp()
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [claiming, setClaiming] = useState(null) // player being claimed → team picker
  const meta = { season: activeSeason, actorUid: user?.uid ?? null }

  const pending = players.filter((p) => p.salaryStatus === 'dropped_pending')
  const cleared = players.filter((p) => p.salaryStatus === 'cleared')
  const rostered = players.filter((p) => (p.salaryStatus ?? 'rostered') === 'rostered')
  const dropCandidates = search.trim()
    ? rostered.filter((p) => p.name?.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 8)
    : []

  const priceOf = (p) => p.prices?.[String(activeSeason)] ?? 0

  async function act(id, fn) {
    setBusyId(id)
    try {
      await fn()
    } catch (e) {
      alert(`Failed: ${e.message}`)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Drop a player */}
      <div className="iff-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Drop a Player</div>
        <div style={{ fontSize: 11, color: 'var(--iff-subtext)', lineHeight: 1.5 }}>
          His salary follows him until he clears {2} FAAB auctions. Mirror ESPN — record the drop
          here when it happens there.
        </div>
        <input
          type="text"
          placeholder="Search rostered players…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {dropCandidates.map((p) => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <PosBadge position={p.position} />
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>
              {p.name}
              <span style={{ color: 'var(--iff-subtext)', fontWeight: 400 }}> · {p.teamName} · ${priceOf(p)}</span>
            </span>
            <button
              className="btn-outline"
              disabled={busyId === p.id}
              onClick={() => act(p.id, () => fs.dropPlayer(p, { ...meta, price: priceOf(p) }).then(() => setSearch('')))}
              style={{ fontSize: 11, padding: '5px 12px' }}
            >
              Drop
            </button>
          </div>
        ))}
      </div>

      {/* Pending — the clock panel */}
      <div className="iff-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '12px 14px', fontSize: 14, fontWeight: 700, borderBottom: '1px solid var(--iff-divider)' }}>
          Dropped — Clock Running ({pending.length})
        </div>
        {pending.length === 0 && (
          <div style={{ padding: 20, fontSize: 12, color: 'var(--iff-subtext)' }}>
            Nobody pending. Drop a player above when it happens in ESPN.
          </div>
        )}
        {pending.map((p, i) => (
          <div key={p.id} style={{ padding: '12px 14px', borderTop: i ? '1px solid rgba(255,255,255,0.04)' : 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <PosBadge position={p.position} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>{p.name}</span>
                <span style={{ display: 'block', fontSize: 10.5, color: 'var(--iff-subtext)' }}>
                  dropped by {p.droppedByTeam ?? p.teamName} · salary ${priceOf(p)}
                </span>
              </span>
              <span className="tnum" style={{ fontSize: 12, fontWeight: 800, color: 'var(--iff-gold)' }}>
                {p.auctionsCleared ?? 0}/2 auctions
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                className="btn-outline"
                disabled={busyId === p.id}
                onClick={() =>
                  act(p.id, async () => {
                    const { done } = await fs.markAuctionCleared(p, meta)
                    if (done) alert(`${p.name} cleared — value reset to $2, out of the cap system.`)
                  })
                }
                style={{ fontSize: 11, padding: '6px 12px' }}
              >
                ✓ Auction Passed ({(p.auctionsCleared ?? 0) + 1}/2)
              </button>
              <button
                className="btn-outline"
                disabled={busyId === p.id}
                onClick={() => setClaiming(p)}
                style={{ fontSize: 11, padding: '6px 12px' }}
              >
                ↑ Claimed by…
              </button>
              <button
                disabled={busyId === p.id}
                onClick={() => act(p.id, () => fs.undoDrop(p))}
                style={{ fontSize: 11, padding: '6px 12px', color: 'var(--iff-subtext)' }}
              >
                Undo
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Cleared — out of the cap system */}
      {cleared.length > 0 && (
        <div className="iff-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', fontSize: 14, fontWeight: 700, borderBottom: '1px solid var(--iff-divider)' }}>
            Cleared — reset to $2 ({cleared.length})
          </div>
          {cleared.map((p, i) => (
            <div key={p.id} style={{ padding: '10px 14px', borderTop: i ? '1px solid rgba(255,255,255,0.04)' : 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
              <PosBadge position={p.position} />
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{p.name}</span>
              <button
                className="btn-outline"
                disabled={busyId === p.id}
                onClick={() => setClaiming(p)}
                style={{ fontSize: 11, padding: '5px 12px' }}
              >
                FAAB pickup by…
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Claim team picker */}
      {claiming && (
        <DetailOverlay title={`${claiming.name} → which team?`} onBack={() => setClaiming(null)}>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 11.5, color: 'var(--iff-subtext)', lineHeight: 1.5, marginBottom: 4 }}>
              {claiming.salaryStatus === 'cleared'
                ? 'Cleared player — joins at his reset $2 value, exempt from the cap this season.'
                : `Claimed before clearing — his $${claiming.prices?.[String(activeSeason)] ?? 0} salary follows and re-enters the new team's cap.`}
            </div>
            {fantasyTeams.map((t) => (
              <button
                key={t.name}
                className="iff-card"
                disabled={busyId === claiming.id}
                onClick={() =>
                  act(claiming.id, async () => {
                    await fs.claimDroppedPlayer(claiming, t.name, {
                      ...meta,
                      price: claiming.prices?.[String(activeSeason)] ?? 0,
                    })
                    setClaiming(null)
                  })
                }
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', textAlign: 'left' }}
              >
                <span style={{ fontSize: 13, fontWeight: 700 }}>{t.name}</span>
              </button>
            ))}
          </div>
        </DetailOverlay>
      )}
    </div>
  )
}

function PlayerEditOverlay({ player, onClose }) {
  const [form, setForm] = useState(player ?? EMPTY_PLAYER)
  const [busy, setBusy] = useState(false)
  const isNew = !player
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const setPrice = (yr, val) => setForm((f) => ({ ...f, prices: { ...f.prices, [yr]: Number(val) || 0 } }))

  async function save() {
    if (!form.name.trim()) return
    setBusy(true)
    try {
      if (isNew) await fs.addPlayer(form).catch(() => {})
      else {
        const { id, ...doc } = form
        await fs.updatePlayer(id, doc).catch(() => {})
      }
      onClose()
    } finally {
      setBusy(false)
    }
  }

  async function deactivate() {
    if (!player?.id) return
    setBusy(true)
    try {
      await fs.deactivatePlayer(player.id).catch(() => {})
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <DetailOverlay title={isNew ? 'Add Player' : 'Edit Player'} onBack={onClose}>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Name">
          <input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Player name" />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Position">
            <select value={form.position} onChange={(e) => set({ position: e.target.value })}>
              {['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].map((p) => <option key={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Team">
            <select value={form.teamName} onChange={(e) => set({ teamName: e.target.value })}>
              {fantasyTeams.map((t) => <option key={t.name}>{t.name}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="NFL Team">
            <input value={form.nflTeam ?? ''} onChange={(e) => set({ nflTeam: e.target.value || null })} placeholder="e.g. Buffalo Bills" />
          </Field>
          <Field label="Contract Years">
            <input type="number" value={form.contractYearsRemaining} onChange={(e) => set({ contractYearsRemaining: Number(e.target.value) || 0 })} />
          </Field>
        </div>
        <Field label="Prices">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {['2026', '2027', '2028'].map((yr) => (
              <div key={yr}>
                <div style={{ fontSize: 10, color: 'var(--iff-subtext)', marginBottom: 3 }}>{yr}</div>
                <input type="number" value={form.prices?.[yr] ?? 0} onChange={(e) => setPrice(yr, e.target.value)} />
              </div>
            ))}
          </div>
        </Field>
        <button className="btn-primary" onClick={save} disabled={busy || !form.name.trim()}>
          {busy ? 'Saving…' : isNew ? 'Add Player' : 'Save Changes'}
        </button>
        {!isNew && (
          <button onClick={deactivate} disabled={busy} style={{ color: '#EF4444', fontSize: 14, fontWeight: 600, padding: 10 }}>
            Deactivate Player
          </button>
        )}
      </div>
    </DetailOverlay>
  )
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, color: 'var(--iff-subtext)' }}>
      {label}
      {children}
    </label>
  )
}

// ── Picks ─────────────────────────────────────────────────────

function PicksSection() {
  const { draftPicks, activeSeason } = useApp()
  const [converting, setConverting] = useState(null)
  const sorted = useMemo(
    () => [...draftPicks].sort((a, b) => a.season - b.season || a.round - b.round),
    [draftPicks],
  )

  return (
    <div className="iff-card">
      {sorted.length === 0 && <div className="empty-state" style={{ padding: 32 }}><div>No available picks.</div></div>}
      {sorted.map((p, i) => (
        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: i < sorted.length - 1 ? '1px solid var(--iff-divider)' : 'none' }}>
          <span style={{ flex: 1 }}>
            <span style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>
              {p.season} Round {p.round}{p.slot ? ` (Pick ${p.slot})` : ''}
            </span>
            <span style={{ display: 'block', fontSize: 10, color: 'var(--iff-subtext)' }}>
              {p.currentTeamName} · ${p.prices?.[String(activeSeason)] ?? 0}
            </span>
          </span>
          <button className="btn-outline" onClick={() => setConverting(p)} style={{ fontSize: 11, padding: '5px 12px' }}>
            Draft Player
          </button>
        </div>
      ))}
      {converting && <PickConversionOverlay pick={converting} onClose={() => setConverting(null)} />}
    </div>
  )
}

function PickConversionOverlay({ pick, onClose }) {
  const [name, setName] = useState('')
  const [nfl, setNfl] = useState('')
  const [position, setPosition] = useState('RB')
  const [busy, setBusy] = useState(false)

  async function convert() {
    if (!name.trim()) return
    setBusy(true)
    try {
      await fs
        .convertPickToPlayer(pick.id, {
          name: name.trim(), position, teamName: pick.currentTeamName,
          nflTeam: nfl.trim() || null, playerPool: 'Rookie Draft',
          rookieRound: pick.round, rookieDraftYear: pick.season,
          purchaseYear: pick.season, acquiredSeason: pick.season,
          contractYearsRemaining: 3, originalPrice: pick.prices?.[String(pick.season)] ?? 0,
          prices: pick.prices ?? {}, tradeHistory: [], isActive: true,
        })
        .catch(() => {})
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <DetailOverlay title={`${pick.season} R${pick.round} → Player`} onBack={onClose}>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Player Name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Drafted player" />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Position">
            <select value={position} onChange={(e) => setPosition(e.target.value)}>
              {['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].map((p) => <option key={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="NFL Team">
            <input value={nfl} onChange={(e) => setNfl(e.target.value)} placeholder="Optional" />
          </Field>
        </div>
        <button className="btn-primary" onClick={convert} disabled={busy || !name.trim()}>
          {busy ? 'Converting…' : 'Convert Pick'}
        </button>
      </div>
    </DetailOverlay>
  )
}

// ── Trades ────────────────────────────────────────────────────
// Every in-app trade executes itself the instant the receiving team
// accepts — no commissioner approval step. This section is now: (1) a
// live audit view of trades still waiting on a response, and (2) the
// tool for the one case that still needs a human: a deal that happened
// OUTSIDE the app (e.g. executed directly in ESPN) and needs recording
// here so this app's rosters/cap/keeper math stay in sync with reality.

function TradesSection() {
  const { trades } = useApp()
  const pending = trades.filter((t) => t.status === 'proposed')
  const [prefill, setPrefill] = useState(null) // {teamA, teamB} from a flagged ingest, or null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 11.5, color: 'var(--iff-subtext)', lineHeight: 1.6, padding: '0 4px' }}>
        Trades execute themselves the moment the other team accepts — assets move, the cap updates,
        and it's logged, all automatically. Nothing to approve here. Waiting-on-response trades are
        listed below for visibility only.
      </div>

      <div className="iff-card">
        {pending.length === 0 ? (
          <div className="empty-state" style={{ padding: 32 }}><div>No trades waiting on a response.</div></div>
        ) : (
          pending.map((t, i) => (
            <div key={t.id} style={{ padding: '12px 14px', borderBottom: i < pending.length - 1 ? '1px solid var(--iff-divider)' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{t.proposingTeamName} ↔ {t.receivingTeamName}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--iff-gold)' }}>PROPOSED — awaiting {t.receivingTeamName}</span>
              </div>
            </div>
          ))
        )}
      </div>

      <EspnIngestQueue onFixManually={setPrefill} />
      <ExternalTradeSection prefill={prefill} onPrefillConsumed={() => setPrefill(null)} />
    </div>
  )
}

/**
 * Record a trade this app never saw proposed — it happened directly in
 * ESPN (or by phone call, or in the parking lot). There's no consent
 * step to wait on since it already happened; this transfers the assets
 * immediately and logs it with its source so it's distinguishable from
 * an app-native deal in the ledger.
 */
/**
 * Trades the ESPN email auto-import couldn't apply on its own — a
 * player name didn't match exactly one player on the roster ESPN said
 * he was coming from (typo, not-yet-synced roster, duplicate name).
 * Nothing was guessed; these sit here until the commissioner resolves
 * them, either by fixing it through Record External Trade below or by
 * dismissing it as a false positive / already handled elsewhere.
 */
function EspnIngestQueue({ onFixManually }) {
  const [items, setItems] = useState(null) // null = loading
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    fs.fetchPendingIngests().then(setItems).catch(() => setItems([]))
  }, [])

  async function dismiss(id) {
    setBusyId(id)
    try {
      await fs.dismissTradeIngest(id)
      setItems((prev) => prev.filter((i) => i.id !== id))
    } catch (e) {
      alert(`Failed: ${e.message}`)
    } finally {
      setBusyId(null)
    }
  }

  function fixManually(item) {
    // Only safe to prefill both team selects when every move in this
    // ingest event agrees on the same two teams — the common case.
    const teams = new Set(item.moves?.flatMap((m) => [m.fromTeam, m.toTeam]) ?? [])
    const [teamA, teamB] = [...teams]
    onFixManually({ teamA: teamA ?? '', teamB: teams.size === 2 ? teamB : '' })
  }

  if (items === null || items.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--iff-accent)' }}>
        ⚠ ESPN Auto-Import — Needs Review ({items.length})
      </div>
      {items.map((item) => (
        <div key={item.id} className="iff-card" style={{ padding: 12, border: '1px solid rgba(230,57,70,0.4)' }}>
          <div style={{ fontSize: 11, color: 'var(--iff-subtext)', marginBottom: 6 }}>
            {item.tradeDateRaw ?? item.receivedAt?.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) ?? 'unknown date'}
          </div>
          {(item.problems ?? []).map((p, i) => (
            <div key={i} style={{ fontSize: 12.5, marginBottom: 3 }}>• {p.reason}</div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn-outline" onClick={() => fixManually(item)} style={{ fontSize: 11, padding: '5px 12px' }}>
              Fix Manually ↓
            </button>
            <button
              onClick={() => dismiss(item.id)}
              disabled={busyId === item.id}
              style={{ fontSize: 11, color: 'var(--iff-subtext)', padding: '5px 12px' }}
            >
              {busyId === item.id ? 'Dismissing…' : 'Dismiss'}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

function ExternalTradeSection({ prefill, onPrefillConsumed }) {
  const { allDisplayAssets, activeSeason } = useApp()
  const [teamA, setTeamA] = useState('')
  const [teamB, setTeamB] = useState('')
  const [fromA, setFromA] = useState(new Set())
  const [fromB, setFromB] = useState(new Set())
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)

  // Coming from a flagged ESPN import — set the teams so the commissioner
  // only has to fix the ambiguous player(s), not re-pick everything.
  useEffect(() => {
    if (!prefill) return
    setTeamA(prefill.teamA ?? '')
    setTeamB(prefill.teamB ?? '')
    setFromA(new Set())
    setFromB(new Set())
    onPrefillConsumed?.()
  }, [prefill, onPrefillConsumed])

  const assetsA = useMemo(
    () => allDisplayAssets.filter((a) => a.teamName === teamA).sort((a, b) => b.currentPrice - a.currentPrice),
    [allDisplayAssets, teamA],
  )
  const assetsB = useMemo(
    () => allDisplayAssets.filter((a) => a.teamName === teamB).sort((a, b) => b.currentPrice - a.currentPrice),
    [allDisplayAssets, teamB],
  )

  const toggle = (set, setter, id) => {
    const next = new Set(set)
    next.has(id) ? next.delete(id) : next.add(id)
    setter(next)
  }
  const toRef = (a) => ({ assetType: a.assetType, assetId: a.id, displayName: a.name, teamName: a.teamName })

  const capImpact = useMemo(() => {
    if (!teamA || !teamB || (fromA.size === 0 && fromB.size === 0)) return null
    return tradeCapImpact(
      allDisplayAssets, activeSeason, teamA, teamB,
      assetsA.filter((a) => fromA.has(a.id)),
      assetsB.filter((a) => fromB.has(a.id)),
    )
  }, [allDisplayAssets, activeSeason, teamA, teamB, assetsA, assetsB, fromA, fromB])

  const canRecord = teamA && teamB && teamA !== teamB && (fromA.size > 0 || fromB.size > 0) && !busy

  async function record() {
    setBusy(true)
    try {
      const id = await fs.recordExternalTrade({
        proposingTeamName: teamA,
        receivingTeamName: teamB,
        assetsFromProposer: assetsA.filter((a) => fromA.has(a.id)).map(toRef),
        assetsFromReceiver: assetsB.filter((a) => fromB.has(a.id)).map(toRef),
        notes: notes.trim(),
        season: activeSeason,
        source: 'espn',
      })
      setDone(id)
      setTeamA(''); setTeamB(''); setFromA(new Set()); setFromB(new Set()); setNotes('')
    } catch (e) {
      alert(`Failed: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 800 }}>Record External Trade</div>
      <div style={{ fontSize: 11, color: 'var(--iff-subtext)', lineHeight: 1.55 }}>
        For a deal that happened outside the app — most often executed straight in ESPN. Pick both
        teams and what moved; it transfers immediately, no waiting on anyone's response.
      </div>

      {done && (
        <div className="iff-card" style={{ padding: 12, fontSize: 12, color: 'var(--iff-green)', border: '1px solid rgba(74,222,128,0.4)' }}>
          ✓ Recorded and executed.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <select value={teamA} onChange={(e) => { setTeamA(e.target.value); setFromA(new Set()) }}>
          <option value="">Team A…</option>
          {fantasyTeams.filter((t) => t.name !== teamB).map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
        </select>
        <select value={teamB} onChange={(e) => { setTeamB(e.target.value); setFromB(new Set()) }}>
          <option value="">Team B…</option>
          {fantasyTeams.filter((t) => t.name !== teamA).map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
        </select>
      </div>

      {teamA && (
        <ExternalAssetPickList title={`${teamA} sends`} assets={assetsA} selected={fromA} onToggle={(id) => toggle(fromA, setFromA, id)} />
      )}
      {teamB && (
        <ExternalAssetPickList title={`${teamB} sends`} assets={assetsB} selected={fromB} onToggle={(id) => toggle(fromB, setFromB, id)} />
      )}

      {capImpact && <TaxWarning impact={capImpact} names={{ proposer: teamA, receiver: teamB }} />}

      <textarea
        rows={2}
        placeholder="Note (optional) — e.g. 'confirmed via GroupMe, executed in ESPN 8/14'"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        style={{ resize: 'vertical' }}
      />

      <button className="btn-primary" onClick={record} disabled={!canRecord} style={{ background: canRecord ? '#16A34A' : undefined }}>
        {busy ? 'Recording…' : 'Record & Execute'}
      </button>
    </div>
  )
}

function ExternalAssetPickList({ title, assets, selected, onToggle }) {
  return (
    <div className="iff-card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '9px 12px', fontSize: 11, fontWeight: 700, color: 'var(--iff-subtext)', borderBottom: '1px solid var(--iff-divider)' }}>
        {title}
      </div>
      <div style={{ maxHeight: 200, overflowY: 'auto' }}>
        {assets.map((a) => (
          <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderTop: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer' }}>
            <input type="checkbox" checked={selected.has(a.id)} onChange={() => onToggle(a.id)} />
            <PosBadge position={a.position} />
            <span style={{ flex: 1, fontSize: 12.5 }}>{a.name}</span>
            <span className="tnum" style={{ fontSize: 11.5, color: 'var(--iff-green)' }}>${a.currentPrice}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

// ── Messages ──────────────────────────────────────────────────

function MessagesSection() {
  const { messages } = useApp()
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  async function post() {
    if (!draft.trim()) return
    setBusy(true)
    try {
      await fs.addMessage(draft.trim()).catch(() => {})
      setDraft('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="iff-card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <textarea
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Post a league-wide message…"
          style={{ resize: 'vertical' }}
        />
        <button className="btn-primary" onClick={post} disabled={busy || !draft.trim()} style={{ alignSelf: 'flex-end', padding: '10px 20px', fontSize: 14 }}>
          {busy ? 'Posting…' : 'Post Message'}
        </button>
      </div>
      <div className="iff-card">
        {messages.map((m, i) => (
          <div key={m.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 14px', borderBottom: i < messages.length - 1 ? '1px solid var(--iff-divider)' : 'none' }}>
            <span style={{ flex: 1, fontSize: 13, lineHeight: 1.5 }}>{m.content}</span>
            <button onClick={() => fs.deleteMessage(m.id).catch(() => {})} aria-label="Delete message" style={{ color: '#EF4444', fontSize: 14 }}>
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Teams (userTeamMap) ───────────────────────────────────────

function TeamsSection() {
  const [config, setConfig] = useState(null)
  const [uid, setUid] = useState('')
  const [team, setTeam] = useState(fantasyTeams[0].name)
  const [busy, setBusy] = useState(false)

  const reload = () => fs.fetchLeagueConfig().then((c) => setConfig(c ?? {})).catch(() => setConfig({}))
  useEffect(() => { reload() }, [])

  async function assign() {
    if (!uid.trim()) return
    setBusy(true)
    try {
      await fs.assignTeam(uid.trim(), team).catch(() => {})
      setUid('')
      reload()
    } finally {
      setBusy(false)
    }
  }

  const entries = Object.entries(config?.userTeamMap ?? {})

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="iff-card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input value={uid} onChange={(e) => setUid(e.target.value)} placeholder="Paste user UID" />
        <div style={{ display: 'flex', gap: 10 }}>
          <select value={team} onChange={(e) => setTeam(e.target.value)} style={{ flex: 1 }}>
            {fantasyTeams.map((t) => <option key={t.name}>{t.name}</option>)}
          </select>
          <button className="btn-outline" onClick={assign} disabled={busy || !uid.trim()} style={{ fontSize: 12, padding: '6px 16px' }}>
            Assign
          </button>
        </div>
      </div>
      <div className="iff-card">
        {entries.length === 0 && <div className="empty-state" style={{ padding: 24 }}><div>No team assignments loaded.</div></div>}
        {entries.map(([mapUid, mapTeam], i) => (
          <div key={mapUid} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: i < entries.length - 1 ? '1px solid var(--iff-divider)' : 'none' }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>{mapTeam}</span>
              <span style={{ display: 'block', fontSize: 9, color: 'var(--iff-subtext)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{mapUid}</span>
            </span>
            <button
              onClick={() => fs.removeTeamAssignment(mapUid).then(reload).catch(() => {})}
              aria-label="Remove assignment"
              style={{ color: '#EF4444', fontSize: 16 }}
            >
              ⊖
            </button>
          </div>
        ))}
      </div>

      <EmailAutoLinkEditor config={config} onSaved={reload} />
    </div>
  )
}

/**
 * Auto-link editor — config/league.teamEmailMap (email → team).
 * When a new member signs in with Google, claimTeam matches their verified
 * email against this list and assigns their team automatically.
 */
function EmailAutoLinkEditor({ config, onSaved }) {
  const [rows, setRows] = useState(null) // [{email, team}]
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)

  // Seed rows from the loaded config once
  useEffect(() => {
    if (config && rows === null) {
      const existing = Object.entries(config.teamEmailMap ?? {}).map(([email, team]) => ({ email, team }))
      setRows(existing.length ? existing : [{ email: '', team: fantasyTeams[0].name }])
    }
  }, [config, rows])

  if (rows === null) return null

  const setRow = (i, patch) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)))

  async function save() {
    setSaving(true)
    try {
      const map = {}
      for (const { email, team } of rows) {
        const e = email.trim().toLowerCase()
        if (e && team) map[e] = team
      }
      await fs.saveTeamEmailMap(map)
      setSavedAt(Date.now())
      onSaved?.()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--iff-subtext)', textTransform: 'uppercase', letterSpacing: 0.5, padding: '6px 4px 0' }}>
        Auto-Link by Email
      </div>
      <div style={{ fontSize: 11, color: 'var(--iff-subtext)', lineHeight: 1.6, padding: '0 4px' }}>
        Enter each member's Google email. When they sign in for the first time, they're linked to
        their team automatically — no UID needed.
      </div>
      <div className="iff-card">
        {rows.map((row, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: i < rows.length - 1 ? '1px solid var(--iff-divider)' : 'none' }}>
            <input
              type="email"
              placeholder="member@gmail.com"
              value={row.email}
              onChange={(e) => setRow(i, { email: e.target.value })}
              style={{ flex: 1, fontSize: 13, padding: '8px 10px' }}
            />
            <select value={row.team} onChange={(e) => setRow(i, { team: e.target.value })} style={{ width: 120, fontSize: 13, padding: '8px 6px' }}>
              {fantasyTeams.map((t) => <option key={t.name}>{t.name}</option>)}
            </select>
            <button
              onClick={() => setRows((r) => r.filter((_, idx) => idx !== i))}
              aria-label="Remove email row"
              style={{ color: '#EF4444', fontSize: 15 }}
            >
              ⊖
            </button>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          className="btn-outline"
          onClick={() => setRows((r) => [...r, { email: '', team: fantasyTeams[0].name }])}
          style={{ fontSize: 12, padding: '7px 16px' }}
        >
          ＋ Add Email
        </button>
        <button className="btn-primary" onClick={save} disabled={saving} style={{ padding: '8px 20px', fontSize: 14 }}>
          {saving ? 'Saving…' : savedAt ? 'Saved ✓' : 'Save Auto-Link List'}
        </button>
      </div>
    </div>
  )
}

// ── Access (authorizedUIDs) ───────────────────────────────────

function AccessSection() {
  const { user } = useApp()
  const [config, setConfig] = useState(null)
  const [uid, setUid] = useState('')
  const [busy, setBusy] = useState(false)

  const reload = () => fs.fetchLeagueConfig().then(setConfig).catch(() => setConfig(null))
  useEffect(() => { reload() }, [])

  async function add() {
    if (!uid.trim()) return
    setBusy(true)
    try {
      await fs.addAuthorizedUID(uid.trim()).catch(() => {})
      setUid('')
      reload()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {user && (
        <div className="iff-card" style={{ padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--iff-subtext)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
            My UID
          </div>
          <div style={{ fontSize: 11, fontFamily: 'monospace', wordBreak: 'break-all', userSelect: 'all' }}>{user.uid}</div>
        </div>
      )}
      <div className="iff-card" style={{ padding: 14, display: 'flex', gap: 10 }}>
        <input value={uid} onChange={(e) => setUid(e.target.value)} placeholder="Paste UID to authorize" style={{ flex: 1 }} />
        <button className="btn-outline" onClick={add} disabled={busy || !uid.trim()} style={{ fontSize: 12, padding: '6px 16px' }}>
          Add
        </button>
      </div>
      <div className="iff-card">
        {(config?.authorizedUIDs ?? []).map((authUid, i, arr) => (
          <div key={authUid} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: i < arr.length - 1 ? '1px solid var(--iff-divider)' : 'none' }}>
            <span style={{ flex: 1, fontSize: 10, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis' }}>{authUid}</span>
            <button
              onClick={() => fs.removeAuthorizedUID(authUid).then(reload).catch(() => {})}
              aria-label="Remove authorization"
              style={{ color: '#EF4444', fontSize: 16 }}
            >
              ⊖
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── GroupMe (trade DM notifications) ──────────────────────────

function GroupMeSection() {
  const [directory, setDirectory] = useState(null) // {groups:[{id,name,members}]}
  const [groupId, setGroupId] = useState('')
  const [userMap, setUserMap] = useState({}) // teamName -> groupme userId
  const [paused, setPaused] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [savedAt, setSavedAt] = useState(null)

  // Load any existing mapping on mount
  useEffect(() => {
    fs.fetchGroupMeConfig()
      .then((cfg) => {
        if (cfg) {
          setGroupId(cfg.groupId ?? '')
          setUserMap(cfg.userMap ?? {})
          setPaused(cfg.paused ?? false)
        }
      })
      .catch(() => {})
  }, [])

  async function togglePaused() {
    const next = !paused
    setPaused(next) // optimistic — toggle feels instant
    try {
      await fs.setGroupMePaused(next)
    } catch (err) {
      setPaused(!next)
      setError(`Couldn't update pause: ${err.message}`)
    }
  }

  async function loadDirectory() {
    setLoading(true)
    setError(null)
    try {
      const call = httpsCallable(await getFunctionsClient(), 'groupmeDirectory')
      const res = await call()
      setDirectory(res.data)
      if (!groupId && res.data.groups?.length === 1) setGroupId(res.data.groups[0].id)
    } catch (err) {
      setError(
        err.message?.includes('GROUPME_TOKEN')
          ? 'The GroupMe token isn’t set yet. Run: firebase functions:secrets:set GROUPME_TOKEN'
          : `Couldn’t reach GroupMe: ${err.message}`,
      )
    } finally {
      setLoading(false)
    }
  }

  async function save() {
    setSaving(true)
    try {
      await fs.saveGroupMeConfig({ groupId, userMap })
      setSavedAt(Date.now())
    } catch (err) {
      setError(`Save failed: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  const group = directory?.groups?.find((g) => g.id === groupId)
  const mappedCount = Object.values(userMap).filter(Boolean).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Master pause switch */}
      <div
        className="iff-card"
        style={{
          padding: 14, display: 'flex', alignItems: 'center', gap: 12,
          border: paused ? '1.5px solid rgba(244,162,97,0.5)' : '1px solid transparent',
        }}
      >
        <span style={{ fontSize: 20 }}>{paused ? '🔕' : '🔔'}</span>
        <span style={{ flex: 1 }}>
          <span style={{ display: 'block', fontSize: 14, fontWeight: 700 }}>
            {paused ? 'GroupMe messages PAUSED' : 'GroupMe messages active'}
          </span>
          <span style={{ display: 'block', fontSize: 11, color: 'var(--iff-subtext)', marginTop: 2 }}>
            {paused
              ? 'No DMs are being sent — trade activity stays in-app only.'
              : 'Trade offers and responses send DMs. Pause while testing.'}
          </span>
        </span>
        <button
          role="switch"
          aria-checked={!paused}
          aria-label="GroupMe messages"
          onClick={togglePaused}
          style={{
            width: 44, height: 26, borderRadius: 13, position: 'relative', flexShrink: 0,
            background: paused ? 'var(--iff-elevated)' : '#22C55E', transition: 'background 0.15s',
          }}
        >
          <span style={{ position: 'absolute', top: 2, left: paused ? 2 : 20, width: 22, height: 22, borderRadius: '50%', background: '#fff', transition: 'left 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.35)' }} />
        </button>
      </div>

      <div style={{ fontSize: 12, color: 'var(--iff-subtext)', lineHeight: 1.6, padding: '0 4px' }}>
        Trade offers and responses are sent as GroupMe direct messages (from your account).
        Match each league member's GroupMe identity to their fantasy team once — done forever.
      </div>

      <button className="btn-primary" onClick={loadDirectory} disabled={loading} style={{ alignSelf: 'flex-start', padding: '10px 20px', fontSize: 14 }}>
        {loading ? 'Loading…' : directory ? 'Reload Groups' : 'Load My GroupMe Groups'}
      </button>

      {error && (
        <div className="iff-card" style={{ padding: 14, fontSize: 12, color: 'var(--iff-accent)', lineHeight: 1.6 }}>
          {error}
        </div>
      )}

      {directory && (
        <div className="iff-card" style={{ padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--iff-subtext)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
            League Group Chat
          </div>
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">Select group…</option>
            {directory.groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name} ({g.members.length} members)</option>
            ))}
          </select>
        </div>
      )}

      {group && (
        <div className="iff-card">
          <div style={{ padding: '12px 14px', fontSize: 11, fontWeight: 700, color: 'var(--iff-subtext)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid var(--iff-divider)' }}>
            Map Members to Teams ({mappedCount}/{fantasyTeams.length})
          </div>
          {fantasyTeams.map((t, i) => (
            <div key={t.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: i < fantasyTeams.length - 1 ? '1px solid var(--iff-divider)' : 'none' }}>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{t.name}</span>
              <select
                value={userMap[t.name] ?? ''}
                onChange={(e) => setUserMap((m) => ({ ...m, [t.name]: e.target.value || undefined }))}
                style={{ width: 190 }}
              >
                <option value="">— no DMs —</option>
                {group.members.map((m) => (
                  <option key={m.userId} value={m.userId}>{m.nickname}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      {(group || mappedCount > 0) && (
        <button className="btn-primary" onClick={save} disabled={saving || !groupId}>
          {saving ? 'Saving…' : savedAt ? 'Saved ✓ — Save Again' : 'Save Mapping'}
        </button>
      )}
    </div>
  )
}
