// AdminView — commissioner-only panel, fifteen sections.
// Navigation is grouped by job (Data / Trades / League / Setup) rather
// than one flat row, remembers the last section across visits, badges
// the sections with work waiting, and is searchable. See SECTION_GROUPS.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../context/AppContext'
import { fantasyTeams, RULE_CATEGORIES } from '../data/staticData'
import { PosBadge, DetailOverlay, ChipScroller, TeamAvatar } from '../components/shared'
import { useIsDesktop } from '../hooks/useBreakpoint'
import * as fs from '../services/firestoreService'
import { parseKeeperCSV, diffKeeperImport } from '../services/keeperImport'
import { computeRolloverPlan } from '../services/seasonRollover'
import { parseRecordLines, weeksFromMap, teamAverages } from '../services/weeklyStats'
import {
  computeSeeds, buildRoundOne, nextChooser, availableOpponents, roundLabel, buildNextRound,
  choosingSeeds,
} from '../services/playoffs'
import { PLAYOFF_TEAMS } from '../data/staticData'
import { tradeCapImpact } from '../services/contracts'
import { trades2026, pickTransfers } from '../data/trades2026'
import { listedAssets } from '../services/tradeEdit'
import { formatTradeDate } from '../services/models'
import TaxWarning from '../components/TaxWarning'
import { getFunctionsClient } from '../firebase'
import { httpsCallable } from 'firebase/functions'

// Fifteen sections is too many for one flat row — the old chip rail put 11
// of them off-screen on desktop and 11 of 15 off-screen on a phone, so
// reaching GroupMe or Trade Signals meant swiping blind past everything
// else. Grouping by what the job actually IS makes the whole set
// scannable at once.
const SECTION_GROUPS = [
  {
    label: 'Data',
    items: [
      { id: 'Database',      glyph: '🗄️', blurb: 'Season, seeding, integrity' },
      { id: 'Keeper Import', glyph: '📥', blurb: 'Keeper-deadline CSV' },
      { id: 'Rollover',      glyph: '🔄', blurb: 'Advance the season' },
    ],
  },
  {
    label: 'Trades',
    items: [
      { id: 'Trades',        glyph: '🤝', blurb: 'Ledger, external, review' },
      { id: 'Trade Signals', glyph: '📡', blurb: 'GroupMe review inbox' },
      { id: 'Picks',         glyph: '🎯', blurb: 'Draft pick assets' },
    ],
  },
  {
    label: 'League',
    items: [
      { id: 'Players',  glyph: '🏈', blurb: 'Roster edits' },
      { id: 'Drops',    glyph: '🕐', blurb: 'Salary clock' },
      { id: 'Rules',    glyph: '📜', blurb: 'Proposals & voting' },
      { id: 'Records',  glyph: '🏆', blurb: 'Trophy Room extremes' },
      { id: 'Messages', glyph: '💬', blurb: 'League broadcast' },
      { id: 'Parlay',   glyph: '🎯', blurb: 'Open the week, record results' },
      { id: 'Standings', glyph: '📊', blurb: 'Records & playoff bracket' },
    ],
  },
  {
    label: 'Setup',
    items: [
      { id: 'Teams',   glyph: '👥', blurb: 'Assignment & auto-link' },
      { id: 'Access',  glyph: '🔑', blurb: 'Who gets in' },
      { id: 'Areas',   glyph: '🎛️', blurb: 'Tab kill-switches' },
      { id: 'GroupMe', glyph: '🔔', blurb: 'DM mapping & pause' },
    ],
  },
]

const SECTIONS = SECTION_GROUPS.flatMap((g) => g.items.map((i) => i.id))
const SECTION_META = Object.fromEntries(SECTION_GROUPS.flatMap((g) => g.items.map((i) => [i.id, i])))

// Admin lives inside the Settings modal, so closing Settings unmounts it
// entirely. Without this, every single visit reset to Database — brutal
// when you're in here constantly and always working in the same two or
// three sections. Persisting to localStorage means reopening lands you
// exactly where you left off.
const LAST_SECTION_KEY = 'iffl.admin.lastSection'

function loadLastSection() {
  try {
    const saved = localStorage.getItem(LAST_SECTION_KEY)
    return SECTIONS.includes(saved) ? saved : 'Database'
  } catch {
    return 'Database' // private mode / storage blocked
  }
}

export default function AdminView() {
  const [section, setSection] = useState(loadLastSection)
  const [query, setQuery] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const isDesktop = useIsDesktop()

  useEffect(() => {
    try { localStorage.setItem(LAST_SECTION_KEY, section) } catch { /* non-fatal */ }
  }, [section])

  // Badges: where work is actually waiting. Without these you have to open
  // each section to discover there's nothing to do in it.
  const [badges, setBadges] = useState({})
  useEffect(() => {
    let alive = true
    fs.fetchPendingIngests()
      .then((items) => {
        if (!alive) return
        setBadges((b) => ({ ...b, Trades: items.filter((i) => i.status === 'needs_review').length }))
      })
      .catch(() => {})
    const unsub = (() => {
      try {
        return fs.listenToGroupMeTradeSignals((sigs) => {
          if (!alive) return
          setBadges((b) => ({ ...b, 'Trade Signals': sigs.filter((s) => s.status === 'unreviewed').length }))
        })
      } catch { return null }
    })()
    return () => { alive = false; if (typeof unsub === 'function') unsub() }
  }, [])

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return SECTION_GROUPS
    return SECTION_GROUPS
      .map((g) => ({ ...g, items: g.items.filter((i) =>
        i.id.toLowerCase().includes(q) || i.blurb.toLowerCase().includes(q)) }))
      .filter((g) => g.items.length > 0)
  }, [query])

  const go = (id) => { setSection(id); setPickerOpen(false); setQuery('') }

  const navList = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Find a section…"
        aria-label="Find an admin section"
        style={{ fontSize: 12, padding: '7px 10px' }}
      />
      {groups.length === 0 && (
        <div style={{ fontSize: 11.5, color: 'var(--iff-subtext)', padding: '4px 2px' }}>
          Nothing matches “{query}”.
        </div>
      )}
      {groups.map((g) => (
        <div key={g.label}>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--iff-subtext)', textTransform: 'uppercase', letterSpacing: 0.7, padding: '0 4px 6px' }}>
            {g.label}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {g.items.map((item) => {
              const active = item.id === section
              const badge = badges[item.id] ?? 0
              return (
                <button
                  key={item.id}
                  onClick={() => go(item.id)}
                  aria-current={active ? 'page' : undefined}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left',
                    padding: '8px 10px', borderRadius: 9,
                    background: active ? 'var(--iff-accent)' : 'transparent',
                    color: active ? '#fff' : 'var(--iff-text)',
                  }}
                >
                  <span style={{ fontSize: 14, flexShrink: 0, lineHeight: 1 }}>{item.glyph}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.id}
                    </span>
                    <span style={{ display: 'block', fontSize: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: active ? 'rgba(255,255,255,0.75)' : 'var(--iff-subtext)' }}>
                      {item.blurb}
                    </span>
                  </span>
                  {badge > 0 && (
                    <span
                      className="tnum"
                      title={`${badge} waiting`}
                      style={{
                        flexShrink: 0, minWidth: 18, textAlign: 'center', padding: '1px 5px', borderRadius: 9,
                        fontSize: 10, fontWeight: 800,
                        background: active ? 'rgba(255,255,255,0.25)' : 'var(--iff-accent)', color: '#fff',
                      }}
                    >
                      {badge}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )

  const body = (
    <>
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
      {section === 'Trade Signals' && <TradeSignalsSection />}
      {section === 'Messages' && <MessagesSection />}
      {section === 'Parlay' && <ParlaySection />}
      {section === 'Standings' && <StandingsSection />}
      {section === 'Teams' && <TeamsSection />}
      {section === 'Access' && <AccessSection />}
      {section === 'GroupMe' && <GroupMeSection />}
    </>
  )

  // ── Desktop: persistent rail, every section visible at once ──
  if (isDesktop) {
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: 14 }}>
        <nav
          aria-label="Admin sections"
          style={{
            width: 208, flexShrink: 0, position: 'sticky', top: 8,
            maxHeight: 'calc(100vh - 160px)', overflowY: 'auto', paddingRight: 2,
          }}
        >
          {navList}
        </nav>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: -0.3, marginBottom: 12 }}>
            {SECTION_META[section]?.glyph} {section}
          </div>
          {body}
        </div>
      </div>
    )
  }

  // ── Mobile: current section in the bar, full grouped picker one tap away.
  // Any section is reachable in exactly two taps, with no sideways swiping.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', position: 'relative' }}>
      <button
        onClick={() => setPickerOpen((v) => !v)}
        aria-expanded={pickerOpen}
        style={{
          display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left',
          padding: '11px 14px', borderBottom: '1px solid var(--iff-divider)',
          position: 'sticky', top: 'calc(44px + var(--safe-top, 0px))', zIndex: 16, background: 'var(--iff-bg)',
        }}
      >
        <span style={{ fontSize: 16, lineHeight: 1 }}>{SECTION_META[section]?.glyph}</span>
        <span style={{ flex: 1, fontSize: 14, fontWeight: 800 }}>{section}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--iff-accent)' }}>
          {pickerOpen ? 'Close ✕' : 'Sections ▾'}
        </span>
      </button>

      {pickerOpen && (
        <div
          style={{
            position: 'sticky', top: 'calc(88px + var(--safe-top, 0px))', zIndex: 15,
            background: 'var(--iff-bg)', borderBottom: '1px solid var(--iff-divider)',
            padding: 14, maxHeight: '70vh', overflowY: 'auto',
          }}
        >
          {navList}
        </div>
      )}

      <div style={{ padding: 14 }}>{body}</div>
    </div>
  )
}

// ── Database ──────────────────────────────────────────────────

function DatabaseSection() {
  const { players, draftPicks, trades, activeSeason, setActiveSeason, isOffSeason, setIsOffSeason } = useApp()
  const [seasonInput, setSeasonInput] = useState(String(activeSeason))
  const [busy, setBusy] = useState(false)
  const [migrating, setMigrating] = useState(false)
  // Ingests held for review (e.g. ESPN players resolved but a GroupMe pick
  // needs manual apply) live in tradeIngests, NOT trades — so surface them
  // in the stat too, otherwise a held trade reads as "0" and hides. See
  // Admin → Trades → "ESPN Auto-Import — Needs Review" to resolve them.
  const [needsReviewCount, setNeedsReviewCount] = useState(0)
  useEffect(() => {
    fs.fetchPendingIngests().then((items) => setNeedsReviewCount(items.length)).catch(() => {})
  }, [])
  const openTrades = trades.filter((t) => t.status === 'proposed' || t.status === 'accepted').length
  const pendingCount = openTrades + needsReviewCount

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
          <span style={{ display: 'block', fontSize: 14 }}>Migrate Weekly Scores</span>
          <span style={{ display: 'block', fontSize: 11, color: 'var(--iff-subtext)', marginTop: 2, lineHeight: 1.5 }}>
            Copies weekly scores out of the POD-only doc into the league-readable
            store that feeds the in-season Dashboard charts. Copies rather than moves —
            the POD original is left untouched. Safe to run more than once.
          </span>
        </span>
        <button
          className="btn-outline"
          disabled={migrating}
          onClick={async () => {
            setMigrating(true)
            try {
              const results = await fs.migrateWeeklyScoresFromPod()
              alert(
                results.length === 0
                  ? 'Nothing to migrate — no weekly scores found in the POD doc.'
                  : `Migrated:\n${results.map((r) => `  ${r.season}: ${r.weeks} week${r.weeks === 1 ? '' : 's'}`).join('\n')}`,
              )
            } catch (e) {
              alert(`Migration failed: ${e.message}`)
            } finally {
              setMigrating(false)
            }
          }}
          style={{ fontSize: 12, padding: '7px 14px' }}
        >
          {migrating ? 'Migrating…' : 'Migrate'}
        </button>
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

      <ImportBigBoardCard />
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
      <div className="iff-card" style={{ padding: '11px 14px', border: '1.5px solid rgba(244,162,97,0.55)', fontSize: 12, lineHeight: 1.6 }}>
        <b style={{ color: 'var(--iff-gold)' }}>⚠ Superseded by the league feed sync.</b>{' '}
        Rosters, prices, and contracts now mirror Jason&apos;s league feed automatically, and the
        sync will overwrite anything changed here within about five minutes. Break-glass only —
        if something is truly wrong, fix it upstream (tell Jason) and let the sync carry it in.
      </div>
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


// ── Standings & playoffs ───────────────────────────────────────
// Two jobs on one screen because the second depends entirely on the
// first: records seed the bracket, so entering them and running the
// opponent draft belong together.

function StandingsSection() {
  const { weeklyScores, weeklyRecords, playoffs, activeSeason } = useApp()
  const [paste, setPaste] = useState('')
  const [errors, setErrors] = useState([])
  const [busy, setBusy] = useState(false)

  const pointsFor = useMemo(() => {
    const totals = {}
    for (const t of teamAverages(weeksFromMap(weeklyScores))) totals[t.teamName] = t.total
    return totals
  }, [weeklyScores])

  const seeds = useMemo(() => computeSeeds(weeklyRecords, pointsFor), [weeklyRecords, pointsFor])
  const selections = playoffs?.selections ?? {}
  const winners = playoffs?.winners ?? {}
  const entered = Object.keys(weeklyRecords ?? {}).length

  async function saveRecords() {
    const { records, errors: errs } = parseRecordLines(paste)
    setErrors(errs)
    if (errs.length > 0 || Object.keys(records).length === 0) {
      if (errs.length === 0) setErrors(['Nothing to save — paste at least one record.'])
      return
    }
    setBusy(true)
    try {
      await fs.saveTeamRecords(activeSeason, records)
      setPaste('')
    } catch (e) {
      setErrors([`Save failed: ${e.message}`])
    } finally {
      setBusy(false)
    }
  }

  async function pick(seed, teamName) {
    // Merge against the CURRENT selections rather than writing the single
    // key — a nested merge on an empty parent would drop the siblings.
    await fs.savePlayoffs(activeSeason, { selections: { ...selections, [String(seed)]: teamName } })
      .catch((e) => alert(`Failed: ${e.message}`))
  }

  async function setWinner(roundKey, gameIndex, teamName, games) {
    const current = winners[roundKey] ?? []
    // Winners are stored POSITIONALLY — index i is game i's winner, and an
    // undecided game holds null rather than being squeezed out. Compacting
    // the array would slide game 2's winner into game 1's slot whenever the
    // games are decided out of order, and the pick would look like it never
    // registered. buildNextRound drops the nulls itself.
    // Clicking the team already marked as winner clears it, which is how a
    // misrecorded result gets undone.
    const next = games.map((g, i) => {
      if (i !== gameIndex) return current[i] ?? null
      return current[i] === teamName ? null : teamName
    })
    await fs.savePlayoffs(activeSeason, { winners: { ...winners, [roundKey]: next } })
      .catch((e) => alert(`Failed: ${e.message}`))
  }

  const roundOne = seeds.length >= PLAYOFF_TEAMS ? buildRoundOne(seeds, selections) : []
  // Each round only unlocks once the one before it is fully decided —
  // passing the previous round's game count is what stops two finished
  // quarterfinals from looking like a completed semifinal.
  const roundTwo = buildNextRound(seeds, winners['1'] ?? [], roundOne.length)
  const roundThree = buildNextRound(seeds, winners['2'] ?? [], roundTwo.length)
  const onTheClock = seeds.length >= PLAYOFF_TEAMS ? nextChooser(seeds, selections) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="iff-card" style={{ padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Season Records</div>
        <div style={{ fontSize: 11, color: 'var(--iff-subtext)', marginBottom: 8, lineHeight: 1.6 }}>
          Paste one team and record per line — <code>Jared 10-4</code>. Ties work too
          (<code>Bill 9-4-1</code>). Records seed the playoff bracket and finally light up the
          <strong> +/-</strong> luck column in the POD&apos;s True Record, which has had nothing
          to compare against until now. Re-pasting replaces what&apos;s there.
        </div>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder={'Jared 11-3\nBill 10-4\nRyan 9-4-1'}
          rows={7}
          style={{ width: '100%', fontFamily: 'monospace', fontSize: 12 }}
        />
        {errors.length > 0 && (
          <div style={{ fontSize: 11.5, color: 'var(--iff-accent)', marginTop: 6 }}>
            {errors.map((e, i) => <div key={i}>• {e}</div>)}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
          <button className="btn-primary" onClick={saveRecords} disabled={busy} style={{ fontSize: 12, padding: '7px 16px' }}>
            {busy ? 'Saving…' : 'Save Records'}
          </button>
          <span style={{ fontSize: 11, color: 'var(--iff-subtext)' }}>
            {entered} team{entered === 1 ? '' : 's'} on file for {activeSeason}
          </span>
        </div>
      </div>

      {seeds.length < PLAYOFF_TEAMS ? (
        <div className="iff-card empty-state" style={{ padding: 20, fontSize: 11.5 }}>
          The opponent draft opens once {PLAYOFF_TEAMS} teams have records
          ({seeds.length} so far).
        </div>
      ) : (
        <>
          <div className="iff-card" style={{ padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Opponent Draft</div>
            <div style={{ fontSize: 11, color: 'var(--iff-subtext)', marginBottom: 10, lineHeight: 1.6 }}>
              Seeds 1–3 choose their first-round opponent in order; seed 4 takes whoever is left.
              You record each pick on the manager&apos;s behalf.
            </div>

            {onTheClock ? (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                  Seed {onTheClock.seed} — {onTheClock.teamName} is on the clock
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {availableOpponents(seeds, selections).map((o) => (
                    <button key={o.teamName} className="btn-outline" onClick={() => pick(onTheClock.seed, o.teamName)}
                      style={{ fontSize: 11.5, padding: '6px 12px' }}>
                      {o.seed}. {o.teamName}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 11.5, color: '#22C55E', marginBottom: 12 }}>
                ✓ Every pick is in — the bracket is set.
              </div>
            )}

            <hr className="divider" />
            <RoundEditor label={roundLabel(8)} roundKey="1" games={roundOne}
              winners={winners['1'] ?? []} onWin={setWinner} />
          </div>

          {roundTwo.length > 0 && (
            <div className="iff-card" style={{ padding: 16 }}>
              <RoundEditor label={roundLabel(4)} roundKey="2" games={roundTwo}
                winners={winners['2'] ?? []} onWin={setWinner} />
            </div>
          )}

          {roundThree.length > 0 && (
            <div className="iff-card" style={{ padding: 16 }}>
              <RoundEditor label={roundLabel(2)} roundKey="3" games={roundThree}
                winners={winners['3'] ?? []} onWin={setWinner} />
            </div>
          )}

          <button
            className="btn-outline"
            onClick={() => {
              if (!confirm('Clear every pick and result for this season\u2019s bracket?')) return
              fs.resetPlayoffs(activeSeason).catch((e) => alert(`Failed: ${e.message}`))
            }}
            style={{ fontSize: 12, padding: '7px 14px', color: 'var(--iff-accent)', alignSelf: 'flex-start' }}
          >
            Reset Bracket
          </button>
        </>
      )}
    </div>
  )
}

function RoundEditor({ label, roundKey, games, winners, onWin }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, margin: '8px 0 6px' }}>{label}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {games.map((g, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 11.5 }}>
            <span style={{ color: 'var(--iff-subtext)', width: 16 }}>{i + 1}</span>
            {g.complete ? (
              <>
                {[g.high, g.low].map((t) => (
                  <button key={t.teamName} onClick={() => onWin(roundKey, i, t.teamName, games)}
                    className={winners[i] === t.teamName ? 'btn-primary' : 'btn-outline'}
                    style={{ fontSize: 11.5, padding: '5px 11px' }}>
                    {t.seed}. {t.teamName}
                    {g.bonus?.teamName === t.teamName && (
                      <span style={{ color: 'var(--iff-gold)', marginLeft: 5 }}>
                        +{g.bonus.points % 1 === 0 ? g.bonus.points : g.bonus.points.toFixed(1)}
                      </span>
                    )}
                  </button>
                ))}
              </>
            ) : (
              <span style={{ color: 'var(--iff-subtext)', fontStyle: 'italic' }}>
                seed {g.high.seed} ({g.high.teamName}) —{' '}
                {roundKey === '1' && !choosingSeeds().includes(g.high.seed)
                  ? 'takes the leftover once the picks are in'
                  : 'opponent not chosen yet'}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

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
    { key: 'scoring',  label: 'In-season scoring charts', glyph: '📈' },
    { key: 'playoffs', label: 'Playoff bracket', glyph: '🏆' },
  ]},
]

function AreasSection() {
  const { disabledAreas, toggleArea, bigBoardInNav, toggleBigBoardInNav } = useApp()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 11.5, color: 'var(--iff-subtext)', lineHeight: 1.6, padding: '0 4px' }}>
        Switch any tab or app section off for the whole league — hidden tabs vanish from
        everyone's navigation instantly. You (admin) always see everything, so you can flip an
        area back on. Dashboard itself can't be disabled.
      </div>
      <div className="iff-card" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ flex: 1 }}>
          <span style={{ display: 'block', fontSize: 14 }}>📋 Big Board in navigation</span>
          <span style={{ display: 'block', fontSize: 11, color: 'var(--iff-subtext)', marginTop: 2, lineHeight: 1.5 }}>
            Off by default. The Big Board is always reachable at{' '}
            <code>iffl-auth.web.app/#board</code> whether or not it shows here — this only
            controls the nav button. Unlike the switches below, this one applies to you too,
            since you&apos;re the only one who can see it at all.
          </span>
        </span>
        <button
          role="switch"
          aria-checked={bigBoardInNav}
          aria-label="Show Big Board in navigation"
          onClick={toggleBigBoardInNav}
          style={{
            width: 44, height: 26, borderRadius: 13, position: 'relative', flexShrink: 0,
            background: bigBoardInNav ? '#22C55E' : 'var(--iff-elevated)', transition: 'background 0.15s',
          }}
        >
          <span style={{ position: 'absolute', top: 2, left: bigBoardInNav ? 20 : 2, width: 22, height: 22, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
        </button>
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
      <div className="iff-card" style={{ padding: '11px 14px', border: '1.5px solid rgba(244,162,97,0.55)', fontSize: 12, lineHeight: 1.6 }}>
        <b style={{ color: 'var(--iff-gold)' }}>⚠ Superseded by the league feed sync.</b>{' '}
        Rosters, prices, and contracts now mirror Jason&apos;s league feed automatically, and the
        sync will overwrite anything changed here within about five minutes. Break-glass only —
        if something is truly wrong, fix it upstream (tell Jason) and let the sync carry it in.
      </div>

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
  const [cancelling, setCancelling] = useState(null)

  /**
   * Commissioner kill-switch for an offer nobody is going to answer.
   *
   * Only ever offered on 'proposed' trades — once a trade is accepted the
   * assets have already moved, and undoing that is a different job than
   * cancelling an offer. Sets 'cancelled' rather than deleting, so the
   * record survives for the ledger.
   */
  async function cancel(t) {
    const why = window.prompt(
      `Cancel the ${t.proposingTeamName} ↔ ${t.receivingTeamName} offer?\n\n` +
      'It leaves both teams\' trade lists and clears the pending badge. Nothing moves — ' +
      'no assets change hands either way.\n\n' +
      'Reason (optional, shown to both teams):',
      '',
    )
    if (why === null) return
    setCancelling(t.id)
    try {
      await fs.cancelTrade(t.id, why.trim())
    } catch (e) {
      alert(`Cancel failed: ${e.message}`)
    } finally {
      setCancelling(null)
    }
  }

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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{t.proposingTeamName} ↔ {t.receivingTeamName}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--iff-gold)' }}>PROPOSED — awaiting {t.receivingTeamName}</span>
                  <button
                    className="btn-outline"
                    disabled={cancelling === t.id}
                    onClick={() => cancel(t)}
                    style={{ fontSize: 11, padding: '4px 10px', borderColor: '#EF4444', color: '#EF4444', whiteSpace: 'nowrap' }}
                  >
                    {cancelling === t.id ? 'Cancelling…' : 'Cancel'}
                  </button>
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      <RepairTradeSection />
      <KeeperSheetTradeImport />
      <EspnIngestQueue onFixManually={setPrefill} />
      <ExternalTradeSection prefill={prefill} onPrefillConsumed={() => setPrefill(null)} />
    </div>
  )
}

/**
 * One-time backfill of the 2026 trades from the Keeper Master sheet.
 *
 * Ledger only — deliberately not Record External Trade below, which moves
 * the assets. These deals are already reflected in the rosters, so this
 * writes history and nothing else. Safe to re-run: doc ids are derived from
 * the trade, so a second run overwrites in place instead of duplicating.
 */
function KeeperSheetTradeImport() {
  const { activeSeason, user } = useApp()
  const [busy, setBusy] = useState(false)

  return (
    <div className="iff-card" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ flex: 1 }}>
        <span style={{ display: 'block', fontSize: 14 }}>Import 2026 Trades from Keeper Sheet</span>
        <span style={{ display: 'block', fontSize: 11, color: 'var(--iff-subtext)', marginTop: 2 }}>
          The {trades2026.length} deals dated Feb 1 2026 or later, from the Keeper Master trade tab.
          Writes the ledger entries, and moves any draft pick that changed hands — ESPN can&apos;t
          roster picks, so trades made outside this app never moved them. Players are left alone;
          ESPN is authoritative there.
          <b> Additive only:</b> an entry that already exists is never rewritten, so notes added by
          hand are safe. To genuinely re-import a corrected trade, delete that trade first.
        </span>
      </span>
      <button
        className="btn-outline"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          try {
            const { imported, skipped } = await fs.seedHistoricalTrades(
              trades2026, activeSeason, { actorUid: user?.uid },
            )
            const picks = await fs.applyPickTransfers(pickTransfers(), {
              season: activeSeason, actorUid: user?.uid,
            })

            const lines = [`Ledger: imported ${imported} of ${trades2026.length} trades.`]
            if (skipped.length) {
              lines.push('', `Left untouched (${skipped.length}):`)
              lines.push(...skipped.map((s) => `· ${s.row.date}  ${s.row.a.team} ↔ ${s.row.b.team} — ${s.reason}`))
            }
            lines.push('', `Picks: moved ${picks.applied.length}.`)
            lines.push(...picks.applied.map((t) => `· ${t.displayName} → ${t.toTeam}`))
            if (picks.skipped.length) {
              lines.push('', `Picks not moved (${picks.skipped.length}):`)
              lines.push(...picks.skipped.map((t) => `· ${t.displayName} → ${t.toTeam} — ${t.reason}`))
            }
            alert(lines.join('\n'))
          } catch (e) {
            alert(`Import failed: ${e.message}`)
          } finally {
            setBusy(false)
          }
        }}
        style={{ fontSize: 12, padding: '6px 14px' }}
      >
        {busy ? 'Importing…' : 'Import'}
      </button>
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
  const { isPreview } = useApp()
  const [items, setItems] = useState(null) // null = loading
  const [err, setErr] = useState(null)
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    // Preview has no Firestore auth, and this queue is only ever populated by
    // a real held import — so without a sample there is no way to review the
    // one admin surface every flagged trade lands on.
    if (isPreview) {
      import('../data/previewData').then((d) => setItems(d.previewIngests ?? []))
      return
    }
    fs.fetchPendingIngests()
      .then((r) => { setItems(r); setErr(null) })
      .catch((e) => { setItems([]); setErr(e?.message || String(e)) })
  }, [isPreview])

  async function dismiss(id) {
    // Dismiss only marks the ingest 'ignored' — it applies nothing. Hitting
    // it on a real held trade drops that trade silently: no assets move and
    // the item disappears, so nothing afterwards says it was lost. The two
    // buttons look symmetrical and are not, so say so before it's too late.
    const ok = window.confirm(
      'Dismiss does NOT apply this trade.\n\n' +
      'No players or picks will move and nothing is added to the ledger — it only ' +
      'clears this item from the review queue.\n\n' +
      'If this trade really happened, cancel and use "Log It" first.\n\n' +
      'Dismiss anyway?',
    )
    if (!ok) return
    setBusyId(id)
    try {
      if (isPreview) setItems((prev) => prev.filter((i) => i.id !== id))
      else await fs.dismissTradeIngest(id)
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
    const teams = new Set(
      item.teamA && item.teamB ? [item.teamA, item.teamB] : (item.moves?.flatMap((m) => [m.fromTeam, m.toTeam]) ?? []),
    )
    const [teamA, teamB] = [...teams]
    onFixManually({ teamA: teamA ?? '', teamB: teams.size === 2 ? teamB : '' })
  }

  // Loud states — never silently render nothing. A held trade must be
  // visible, and a read failure must say so instead of vanishing.
  if (items === null) {
    return <div className="iff-card" style={{ padding: 12, fontSize: 12, color: 'var(--iff-subtext)' }}>Checking for trades needing review…</div>
  }
  if (err) {
    return (
      <div className="iff-card" style={{ padding: 12, fontSize: 12, color: 'var(--iff-red, #e63946)', border: '1px solid rgba(230,57,70,0.5)' }}>
        ⚠ Couldn't load the review queue: {err}
        <div style={{ fontSize: 11, color: 'var(--iff-subtext)', marginTop: 4 }}>Make sure you're signed in as the commissioner account.</div>
      </div>
    )
  }
  if (items.length === 0) {
    return <div className="iff-card" style={{ padding: 12, fontSize: 12, color: 'var(--iff-subtext)' }}>No trades waiting for review. 🎉</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--iff-accent)' }}>
        ⚠ ESPN Auto-Import — Needs Review ({items.length})
      </div>
      {items.map((item) => {
        // Support BOTH shapes: legacy matchPlayers `problems[{reason}]` AND
        // the newer reconcile `reconcileReasons[string]` (e.g. a held pick).
        const reasons = [
          ...((item.problems ?? []).map((p) => p.reason)),
          ...((item.reconcileReasons ?? [])),
        ]
        // Show the players + any flagged picks so the commissioner sees the
        // actual deal, not just a date.
        const moveLines = (item.moves ?? []).map((m) =>
          `${m.player}: ${m.fromTeam} → ${m.toTeam}`)
        const pickLines = (item.groupmePicks ?? []).map((p) =>
          `Pick: ${p.year ?? '?'} R${p.round} (apply manually)`)
        return (
        <div key={item.id} className="iff-card" style={{ padding: 12, border: '1px solid rgba(230,57,70,0.4)' }}>
          <div style={{ fontSize: 11, color: 'var(--iff-subtext)', marginBottom: 6 }}>
            {item.tradeDateRaw ?? item.receivedAt?.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) ?? 'unknown date'}
          </div>
          {moveLines.map((l, i) => (
            <div key={`m${i}`} style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 2 }}>{l}</div>
          ))}
          {pickLines.map((l, i) => (
            <div key={`p${i}`} style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--iff-accent)', marginBottom: 2 }}>{l}</div>
          ))}
          {reasons.map((r, i) => (
            <div key={`r${i}`} style={{ fontSize: 12, color: 'var(--iff-subtext)', marginBottom: 3, marginTop: i === 0 ? 6 : 0 }}>• {r}</div>
          ))}

          {/* A held trade is unresolvable without these. Record it below
              (teams pre-filled), then dismiss it here to clear the queue. */}
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button
              className="btn-outline"
              disabled={busyId === item.id}
              onClick={() => fixManually(item)}
              style={{ fontSize: 11.5, padding: '6px 12px' }}
            >
              Log It ›
            </button>
            <button
              className="btn-outline"
              disabled={busyId === item.id}
              onClick={() => dismiss(item.id)}
              style={{ fontSize: 11.5, padding: '6px 12px', borderColor: 'var(--iff-divider)', color: 'var(--iff-subtext)' }}
            >
              {busyId === item.id ? 'Working…' : 'Dismiss'}
            </button>
          </div>
        </div>
        )
      })}
    </div>
  )
}

/**
 * Scroll `el` to the top of whichever ancestor actually scrolls.
 *
 * Not scrollIntoView: the Admin panel sits inside nested .overlay-scroll
 * containers, and the browser treats a section that is merely on-screen as
 * "already in view" and does nothing — which is exactly the case that made
 * the Log It button look dead. Walking to the real scroll parent and setting
 * scrollTop is deterministic.
 */
function scrollToTopOf(el) {
  if (!el) return
  const smooth = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  for (let p = el.parentElement; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight + 4) {
      const delta = el.getBoundingClientRect().top - p.getBoundingClientRect().top - 12
      p.scrollTo({ top: p.scrollTop + delta, behavior: smooth ? 'smooth' : 'auto' })
      return
    }
  }
  el.scrollIntoView({ block: 'start' })
}

function ExternalTradeSection({ prefill, onPrefillConsumed }) {
  // "Log It" fills these fields from a held import, but the section sits below
  // the fold on a normal window — so the click filled them invisibly and read
  // as a dead button. Scroll to what was just filled in.
  const sectionRef = useRef(null)
  const { allDisplayAssets, activeSeason } = useApp()
  const [teamA, setTeamA] = useState('')
  const [teamB, setTeamB] = useState('')
  const [fromA, setFromA] = useState(new Set())
  const [fromB, setFromB] = useState(new Set())
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)
  // "Log It" fills this form from a held import. Scrolling alone proved
  // unreliable to verify across the nested admin overlays, so the section
  // also says out loud that it was just pre-filled — feedback that doesn't
  // depend on where the viewport happens to be.
  const [prefilled, setPrefilled] = useState(false)

  // Coming from a flagged ESPN import — set the teams so the commissioner
  // only has to fix the ambiguous player(s), not re-pick everything.
  useEffect(() => {
    if (!prefill) return
    setTeamA(prefill.teamA ?? '')
    setTeamB(prefill.teamB ?? '')
    setFromA(new Set())
    setFromB(new Set())
    // Deferred a frame: setTeamA above expands this section with the team's
    // roster, and measuring before React commits that gives a stale offset —
    // which is why the earlier scrollIntoView appeared to do nothing at all.
    setPrefilled(true)
    requestAnimationFrame(() => scrollToTopOf(sectionRef.current))
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
      setPrefilled(false)
      setTeamA(''); setTeamB(''); setFromA(new Set()); setFromB(new Set()); setNotes('')
    } catch (e) {
      alert(`Failed: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div ref={sectionRef} style={{ display: 'flex', flexDirection: 'column', gap: 12, scrollMarginTop: 12 }}>
      {prefilled && (
        <div
          role="status"
          className="iff-card"
          style={{
            padding: '10px 13px', border: '1.5px solid var(--iff-accent)',
            fontSize: 12, lineHeight: 1.5,
          }}
        >
          <b style={{ color: 'var(--iff-accent)' }}>Pre-filled from the held import.</b>{' '}
          Both teams are set below — pick the players and picks that actually moved, then
          <b> Record &amp; Execute</b>. Dismiss the review item afterwards.
        </div>
      )}
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
          <label key={a.id} style={{ display: 'grid', gridTemplateColumns: 'auto auto minmax(0, 1fr) auto', alignItems: 'center', columnGap: 8, width: '100%', padding: '9px 12px', borderTop: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer' }}>
            <input type="checkbox" checked={selected.has(a.id)} onChange={() => onToggle(a.id)} style={{ width: 18, height: 18, flexShrink: 0, margin: 0 }} />
            <PosBadge position={a.position} />
            <span style={{ minWidth: 0, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</span>
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
  const [mode, setMode] = useState('all')
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
          setMode(cfg.mode ?? (cfg.paused ? 'paused' : 'all'))
        }
      })
      .catch(() => {})
  }, [])

  async function chooseMode(next) {
    const prev = mode
    setMode(next) // optimistic — the control feels instant
    try {
      await fs.setGroupMeMode(next)
    } catch (err) {
      setMode(prev)
      setError(`Couldn't change delivery: ${err.message}`)
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
          border: mode === 'all' ? '1px solid transparent' : '1.5px solid rgba(244,162,97,0.5)',
        }}
      >
        <span style={{ fontSize: 20 }}>{mode === 'paused' ? '🔕' : mode === 'commissioner' ? '🔂' : '🔔'}</span>
        <span style={{ flex: 1 }}>
          <span style={{ display: 'block', fontSize: 14, fontWeight: 700 }}>
            {mode === 'paused' ? 'GroupMe messages PAUSED'
              : mode === 'commissioner' ? 'GroupMe messages — you only'
                : 'GroupMe messages active'}
          </span>
          <span style={{ display: 'block', fontSize: 11, color: 'var(--iff-subtext)', marginTop: 2, lineHeight: 1.5 }}>
            {mode === 'paused'
              ? 'Nothing is sent to anyone — trade activity stays in-app only, and you will not be told when an import needs review.'
              : mode === 'commissioner'
                ? 'Every DM is redirected to you, tagged with who it was meant for. Nobody else receives anything.'
                : 'Everyone gets their own DMs — offers, responses, and review alerts.'}
          </span>
        </span>
        <span style={{ display: 'flex', gap: 4, background: 'var(--iff-elevated)', borderRadius: 9, padding: 3, flexShrink: 0 }}>
          {[
            ['paused', 'Off'],
            ['commissioner', 'You only'],
            ['all', 'Everyone'],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => chooseMode(key)}
              aria-pressed={mode === key}
              style={{
                padding: '5px 11px', borderRadius: 7, fontSize: 11, fontWeight: 700,
                whiteSpace: 'nowrap',
                background: mode === key
                  ? (key === 'all' ? '#22C55E' : key === 'commissioner' ? 'var(--iff-gold)' : 'var(--iff-accent)')
                  : 'transparent',
                color: mode === key ? '#0A0D1A' : 'var(--iff-subtext)',
              }}
            >
              {label}
            </button>
          ))}
        </span>
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

// ── Trade Signals ─────────────────────────────────────────────
// Review inbox for GroupMe trade chatter captured hourly by the
// pollGroupMeTrades Cloud Function. GroupMe is the only record of the
// pick legs of a trade (ESPN's tool can't express pick trades), so every
// 🚨/keyword message lands here as 'unreviewed'. The commissioner pairs
// each real deal with its ESPN-imported player legs, records the picks by
// hand under Trades, then marks the signal 'recorded'. Jokes/backouts get
// 'dismissed'. Nothing here auto-transfers assets.
function TradeSignalsSection() {
  const [signals, setSignals] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [filter, setFilter] = useState('unreviewed') // unreviewed | all
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    const unsub = fs.listenToGroupMeTradeSignals((rows) => {
      setSignals(rows)
      setLoaded(true)
    })
    return unsub
  }, [])

  async function mark(sig, status) {
    setBusyId(sig.id)
    try {
      await fs.setTradeSignalStatus(sig.id, status)
    } catch (err) {
      alert(`Couldn't update signal: ${err.message}`)
    } finally {
      setBusyId(null)
    }
  }

  async function remove(sig) {
    if (!confirm('Delete this signal permanently? (Use Dismiss instead to keep an audit trail.)')) return
    setBusyId(sig.id)
    try {
      await fs.deleteTradeSignal(sig.id)
    } catch (err) {
      alert(`Couldn't delete: ${err.message}`)
    } finally {
      setBusyId(null)
    }
  }

  const shown = filter === 'unreviewed'
    ? signals.filter((s) => (s.status ?? 'unreviewed') === 'unreviewed')
    : signals
  const unreviewedCount = signals.filter((s) => (s.status ?? 'unreviewed') === 'unreviewed').length

  const statusStyle = (status) => {
    if (status === 'recorded') return { label: 'Recorded', bg: 'rgba(34,197,94,0.15)', fg: '#22C55E' }
    if (status === 'dismissed') return { label: 'Dismissed', bg: 'var(--iff-elevated)', fg: 'var(--iff-subtext)' }
    return { label: 'Unreviewed', bg: 'rgba(244,162,97,0.18)', fg: 'var(--iff-accent)' }
  }

  const fmtWhen = (d) => {
    if (!d) return ''
    try { return new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) }
    catch { return '' }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 12, color: 'var(--iff-subtext)', lineHeight: 1.6, padding: '0 4px' }}>
        Trade chatter captured from the league GroupMe (🚨 + keywords), checked hourly. GroupMe is
        the only record of <strong>draft-pick legs</strong> — ESPN's tool can't express them. Pair each real
        deal with its ESPN-imported players, record the picks under <strong>Trades</strong>, then mark it
        <strong> Recorded</strong>. Jokes and backouts → <strong>Dismiss</strong>. Nothing here transfers assets automatically.
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '0 4px' }}>
        <button
          onClick={() => setFilter('unreviewed')}
          style={{ padding: '5px 12px', borderRadius: 16, fontSize: 12, fontWeight: 600,
            background: filter === 'unreviewed' ? 'var(--iff-accent)' : 'var(--iff-elevated)',
            color: filter === 'unreviewed' ? '#fff' : 'var(--iff-subtext)' }}>
          Unreviewed ({unreviewedCount})
        </button>
        <button
          onClick={() => setFilter('all')}
          style={{ padding: '5px 12px', borderRadius: 16, fontSize: 12, fontWeight: 600,
            background: filter === 'all' ? 'var(--iff-accent)' : 'var(--iff-elevated)',
            color: filter === 'all' ? '#fff' : 'var(--iff-subtext)' }}>
          All ({signals.length})
        </button>
      </div>

      {!loaded && (
        <div className="iff-card" style={{ padding: 14, fontSize: 13, color: 'var(--iff-subtext)' }}>Loading signals…</div>
      )}

      {loaded && shown.length === 0 && (
        <div className="iff-card" style={{ padding: 18, fontSize: 13, color: 'var(--iff-subtext)', textAlign: 'center' }}>
          {filter === 'unreviewed' ? 'No trade signals waiting for review. 🎉' : 'No trade signals captured yet.'}
        </div>
      )}

      {shown.map((sig) => {
        const st = statusStyle(sig.status ?? 'unreviewed')
        const busy = busyId === sig.id
        return (
          <div key={sig.id} className="iff-card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10, opacity: busy ? 0.55 : 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{sig.senderName}</span>
              <span style={{ fontSize: 11, color: 'var(--iff-subtext)' }}>{fmtWhen(sig.postedAt)}</span>
              <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 10, background: st.bg, color: st.fg, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                {st.label}
              </span>
            </div>

            <div style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {sig.text || <span style={{ color: 'var(--iff-subtext)', fontStyle: 'italic' }}>(no text — media or system)</span>}
            </div>

            {Array.isArray(sig.reasons) && sig.reasons.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {sig.reasons.map((r) => (
                  <span key={r} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 8, background: 'var(--iff-elevated)', color: 'var(--iff-subtext)' }}>
                    {r.startsWith('emoji:') ? '🚨 siren' : r.replace('keyword:', 'kw: ')}
                  </span>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(sig.status ?? 'unreviewed') !== 'recorded' && (
                <button onClick={() => mark(sig, 'recorded')} disabled={busy}
                  style={{ padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: '#22C55E', color: '#fff' }}>
                  ✓ Recorded
                </button>
              )}
              {(sig.status ?? 'unreviewed') !== 'dismissed' && (
                <button onClick={() => mark(sig, 'dismissed')} disabled={busy}
                  style={{ padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: 'var(--iff-elevated)', color: 'var(--iff-subtext)' }}>
                  Dismiss
                </button>
              )}
              {(sig.status ?? 'unreviewed') !== 'unreviewed' && (
                <button onClick={() => mark(sig, 'unreviewed')} disabled={busy}
                  style={{ padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: 'var(--iff-elevated)', color: 'var(--iff-subtext)' }}>
                  Reopen
                </button>
              )}
              <button onClick={() => remove(sig)} disabled={busy}
                style={{ marginLeft: 'auto', padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: 'transparent', color: 'var(--iff-subtext)' }}>
                Delete
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
// ── Parlay ────────────────────────────────────────────────────
// The week control that was missing. The Dashboard card renders only when
// config/parlay.open is true, and nothing in the app could set that — so
// once a week closed, the whole feature became unreachable for everyone
// including the commissioner, recoverable only by hand-editing Firestore.
//
// Also surfaces parlayWeeks, which saveParlayWeek has always written to
// but nothing ever read back.

function ParlaySection() {
  const { parlayConfig, parlayEntries, activeSeason } = useApp()
  const [week, setWeek] = useState('')
  const [lockLocal, setLockLocal] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState(null)
  const [history, setHistory] = useState([])
  const [result, setResult] = useState({ hit: null, pot: '', comment: '' })

  const open = Boolean(parlayConfig?.open)

  useEffect(() => {
    setWeek(parlayConfig?.week != null ? String(parlayConfig.week) : '')
    setLockLocal(toLocalInput(parlayConfig?.lockAt))
  }, [parlayConfig?.week, parlayConfig?.lockAt])

  const loadHistory = () =>
    fs.fetchParlayWeeks(activeSeason).then(setHistory).catch(() => setHistory([]))
  useEffect(() => { loadHistory() }, [activeSeason])

  const entered = new Set(parlayEntries.map((e) => e.teamName))
  const missing = fantasyTeams.map((t) => t.name).filter((n) => !entered.has(n))

  async function saveWeek(nextOpen) {
    const w = Number(week)
    if (!Number.isFinite(w) || w < 1 || w > 18) { setNote('Week must be 1–18.'); return }
    const lockAt = lockLocal ? new Date(lockLocal) : null
    if (nextOpen && !lockAt) { setNote('Set a lock time before opening — entries are gated on it.'); return }
    if (nextOpen && lockAt < new Date()) { setNote('That lock time is in the past; entries would be closed immediately.'); return }
    setBusy(true); setNote(null)
    try {
      await fs.setParlayConfig({ season: activeSeason, week: w, lockAt, open: nextOpen })
      setNote(nextOpen ? `Week ${w} is open — the card is live on everyone's dashboard.` : `Week ${w} closed.`)
    } catch (e) {
      setNote(`Failed: ${e.message}`)
    } finally { setBusy(false) }
  }

  async function recordResult() {
    if (result.hit == null) { setNote('Mark the parlay hit or missed first.'); return }
    const w = Number(week)
    if (!Number.isFinite(w)) { setNote('Need a week number to record against.'); return }
    setBusy(true); setNote(null)
    try {
      const pot = Number(result.pot) || 0
      await fs.saveParlayWeek({
        season: activeSeason,
        week: w,
        hit: result.hit,
        potTotal: pot,
        entrantCount: parlayEntries.length,
        payoutPer: result.hit && parlayEntries.length ? Math.round((pot / parlayEntries.length) * 100) / 100 : 0,
        entries: parlayEntries.map((e) => ({ teamName: e.teamName, playerName: e.playerName })),
        note: result.comment || null,
        recordedAt: new Date().toISOString(),
      })
      setNote(`Week ${w} recorded.`)
      setResult({ hit: null, pot: '', comment: '' })
      loadHistory()
    } catch (e) {
      setNote(`Failed: ${e.message}`)
    } finally { setBusy(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="iff-card" style={{ padding: 14, borderLeft: `3px solid ${open ? '#22C55E' : 'var(--iff-subtext)'}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 800 }}>
            {open ? `Week ${parlayConfig.week} is OPEN` : 'No week open'}
          </span>
          {open && (
            <span className="tnum" style={{ fontSize: 11, color: 'var(--iff-subtext)' }}>
              {parlayEntries.length}/12 in
            </span>
          )}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--iff-subtext)', lineHeight: 1.6 }}>
          {open
            ? 'The card is showing on every dashboard. Entries stop at the lock time.'
            : 'While closed, the parlay card is hidden from the league — open a week to bring it back.'}
        </div>
      </div>

      <div className="iff-card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 11 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800 }}>Week control</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ fontSize: 11, color: 'var(--iff-subtext)' }}>
            Week
            <input type="number" min="1" max="18" value={week} onChange={(e) => setWeek(e.target.value)}
              className="tnum" style={{ display: 'block', width: 70, marginTop: 4, textAlign: 'center' }} />
          </label>
          <label style={{ fontSize: 11, color: 'var(--iff-subtext)', flex: 1, minWidth: 200 }}>
            Locks at (your local time)
            <input type="datetime-local" value={lockLocal} onChange={(e) => setLockLocal(e.target.value)}
              style={{ display: 'block', width: '100%', marginTop: 4 }} />
          </label>
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--iff-subtext)' }}>
          Convention: 30 minutes before Sunday's first kickoff.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn-primary" disabled={busy} onClick={() => saveWeek(true)} style={{ fontSize: 12, padding: '7px 16px' }}>
            {open ? 'Update & keep open' : 'Open this week'}
          </button>
          {open && (
            <button disabled={busy} onClick={() => saveWeek(false)}
              style={{ fontSize: 12, padding: '7px 14px', color: 'var(--iff-subtext)' }}>
              Close week
            </button>
          )}
        </div>
        {note && <div style={{ fontSize: 11.5, color: 'var(--iff-accent)' }}>{note}</div>}
      </div>

      {open && (
        <div className="iff-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '11px 14px', fontSize: 12.5, fontWeight: 800, borderBottom: '1px solid var(--iff-divider)' }}>
            Entries — {parlayEntries.length} in, {missing.length} out
          </div>
          {parlayEntries.map((e, i) => (
            <div key={e.id ?? i} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 14px', borderTop: i ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
              <TeamAvatar name={e.teamName} size={20} />
              <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700 }}>{e.teamName}</span>
              <span style={{ fontSize: 12, color: 'var(--iff-subtext)' }}>{e.playerName}</span>
            </div>
          ))}
          {missing.length > 0 && (
            <div style={{ padding: '9px 14px', borderTop: '1px solid var(--iff-divider)', fontSize: 11.5, color: 'var(--iff-gold)' }}>
              Still out: {missing.join(', ')}
            </div>
          )}
        </div>
      )}

      <div className="iff-card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 11 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800 }}>Record the result</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[['Hit', true], ['Missed', false]].map(([label, val]) => (
            <button key={label} onClick={() => setResult((r) => ({ ...r, hit: val }))}
              style={{
                padding: '6px 16px', borderRadius: 18, fontSize: 12, fontWeight: 700,
                background: result.hit === val ? (val ? '#22C55E' : 'var(--iff-accent)') : 'var(--iff-elevated)',
                color: result.hit === val ? '#fff' : 'var(--iff-subtext)',
              }}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ fontSize: 11, color: 'var(--iff-subtext)' }}>
            Pot ($)
            <input type="number" min="0" value={result.pot} onChange={(e) => setResult((r) => ({ ...r, pot: e.target.value }))}
              className="tnum" style={{ display: 'block', width: 90, marginTop: 4, textAlign: 'center' }} />
          </label>
          <label style={{ fontSize: 11, color: 'var(--iff-subtext)', flex: 1, minWidth: 180 }}>
            Note (optional)
            <input type="text" value={result.comment} onChange={(e) => setResult((r) => ({ ...r, comment: e.target.value }))}
              placeholder="e.g. Foley low, 6 of 8 hit" style={{ display: 'block', width: '100%', marginTop: 4 }} />
          </label>
        </div>
        <button className="btn-primary" disabled={busy} onClick={recordResult} style={{ alignSelf: 'flex-start', fontSize: 12, padding: '7px 16px' }}>
          Save week result
        </button>
      </div>

      {history.length > 0 && (
        <div className="iff-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '11px 14px', fontSize: 12.5, fontWeight: 800, borderBottom: '1px solid var(--iff-divider)' }}>
            {activeSeason} results
          </div>
          {history.map((w, i) => (
            <div key={w.id ?? i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderTop: i ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
              <span className="tnum" style={{ width: 54, fontSize: 12, fontWeight: 700 }}>Wk {w.week}</span>
              <span style={{ fontSize: 11.5, fontWeight: 800, color: w.hit ? 'var(--iff-green)' : 'var(--iff-subtext)' }}>
                {w.hit ? 'HIT' : 'missed'}
              </span>
              <span style={{ flex: 1, fontSize: 11, color: 'var(--iff-subtext)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {w.note ?? ''}
              </span>
              <span className="tnum" style={{ fontSize: 11.5, color: 'var(--iff-gold)' }}>
                {w.potTotal ? `$${w.potTotal}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Date -> value for <input type="datetime-local"> in the viewer's zone. */
function toLocalInput(d) {
  if (!d) return ''
  const dt = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(dt.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`
}

/**
 * One-time migration of the Big Board off Supabase.
 *
 * The old /board.html page read and wrote a Supabase table with an anon key
 * embedded in public HTML, and that table's RLS policies allowed read,
 * update AND insert to anyone — so the board was world-writable to anybody
 * who found the URL. This pulls the live rows into Firestore, where the
 * commissioner-only rule applies. Keyed by the original row id, so
 * re-running overwrites instead of duplicating.
 */
function ImportBigBoardCard() {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  async function run() {
    setBusy(true); setResult(null)
    try {
      const { imported } = await fs.importBigBoardFromSupabase()
      setResult({ ok: true, msg: `${imported} players imported. Open the Big Board tab.` })
    } catch (e) {
      setResult({ ok: false, msg: e.message })
    } finally { setBusy(false) }
  }

  return (
    <div className="iff-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ flex: 1 }}>
          <span style={{ display: 'block', fontSize: 14 }}>Import Big Board</span>
          <span style={{ display: 'block', fontSize: 11, color: 'var(--iff-subtext)', marginTop: 2, lineHeight: 1.5 }}>
            Pulls the keeper board off the old Supabase page into Firestore, behind
            commissioner-only rules. Safe to re-run — it overwrites by row id rather
            than duplicating.
          </span>
        </span>
        <button className="btn-outline" onClick={run} disabled={busy} style={{ fontSize: 12, padding: '6px 14px', whiteSpace: 'nowrap' }}>
          {busy ? 'Importing…' : 'Import'}
        </button>
      </div>
      {result && (
        <div style={{ fontSize: 12, color: result.ok ? 'var(--iff-green)' : 'var(--iff-accent)' }}>
          {result.msg}
        </div>
      )}
    </div>
  )
}

/**
 * Attach an asset the original import never saw — in practice a draft pick,
 * because an ESPN trade email cannot contain one.
 *
 * Edits the existing trade rather than recording a second one. Two
 * half-trades between the same teams on the same day is a worse record than
 * one incomplete trade: nothing afterwards can tell they were the same deal.
 */
function RepairTradeSection() {
  const { trades, allDisplayAssets, activeSeason, user } = useApp()
  const [tradeId, setTradeId] = useState('')
  const [assetId, setAssetId] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const done = useMemo(
    () => trades
      .filter((t) => t.status === 'completed' || t.status === 'historical')
      .sort((a, b) => new Date(b.date) - new Date(a.date)),
    [trades],
  )
  const trade = done.find((t) => t.id === tradeId) ?? null
  const onTrade = trade ? listedAssets(trade) : []

  // Only assets held by one of the two teams can join, and the direction is
  // derived from which one holds it — so the list is the whole input.
  const candidates = useMemo(() => {
    if (!trade) return []
    const teams = [trade.proposingTeamName, trade.receivingTeamName]
    const already = new Set(onTrade.map((a) => a.assetId))
    return allDisplayAssets
      .filter((a) => teams.includes(a.teamName) && !already.has(a.assetId))
      .sort((a, b) => Number(b.isPick) - Number(a.isPick) || a.name.localeCompare(b.name))
  }, [trade, allDisplayAssets, onTrade])

  async function add() {
    const a = candidates.find((c) => c.assetId === assetId)
    if (!a) return
    setBusy(true); setMsg(null)
    try {
      const plan = await fs.addAssetToTrade(trade.id, {
        assetId: a.assetId,
        assetType: a.isPick ? 'draftPick' : 'player',
        displayName: a.name,
        currentTeam: a.teamName,
      }, { actorUid: user?.uid })
      setMsg({ ok: true, text: `${a.name} moved ${plan.fromTeam} → ${plan.toTeam} and added to the trade.` })
      setAssetId('')
    } catch (e) {
      setMsg({ ok: false, text: e.message })
    } finally {
      setBusy(false)
    }
  }

  async function reverse() {
    const why = window.prompt(
      `Reverse the ${trade.proposingTeamName} ↔ ${trade.receivingTeamName} trade?\n\n` +
      'Every player and pick on it goes back to the team that sent it, and both teams are told. ' +
      'Use this when ESPN voids a trade.\n\nReason (optional):',
      'Voided in ESPN',
    )
    if (why === null) return
    setBusy(true); setMsg(null)
    try {
      await fs.reverseTrade(trade.id, why.trim())
      setMsg({ ok: true, text: 'Reversal requested — assets move back within a few seconds.' })
    } catch (e) {
      setMsg({ ok: false, text: e.message })
    } finally {
      setBusy(false)
    }
  }

  async function drop(a) {
    if (!window.confirm(`Remove ${a.displayName} from this trade?\n\nIt goes back to the team that sent it.`)) return
    setBusy(true); setMsg(null)
    try {
      const plan = await fs.removeAssetFromTrade(trade.id, a.assetId, { actorUid: user?.uid })
      setMsg({ ok: true, text: `${a.displayName} returned to ${plan.backTo}.` })
    } catch (e) {
      setMsg({ ok: false, text: e.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="iff-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span>
        <span style={{ display: 'block', fontSize: 14 }}>Fix a recorded trade</span>
        <span style={{ display: 'block', fontSize: 11, color: 'var(--iff-subtext)', marginTop: 2, lineHeight: 1.5 }}>
          Add something the original import missed — almost always a draft pick, since an ESPN
          trade email can&apos;t contain one. The asset moves for real and lands on the ledger;
          which way it goes is worked out from whoever holds it now.
        </span>
      </span>

      <select value={tradeId} onChange={(e) => { setTradeId(e.target.value); setAssetId(''); setMsg(null) }}>
        <option value="">Pick a completed trade…</option>
        {done.map((t) => (
          <option key={t.id} value={t.id}>
            {formatTradeDate(t.date)} — {t.proposingTeamName} ↔ {t.receivingTeamName}
          </option>
        ))}
      </select>

      {trade && (
        <>
          <div style={{ fontSize: 11, color: 'var(--iff-subtext)' }}>
            Currently on this trade ({activeSeason}):
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {onTrade.length === 0 && (
              <span style={{ fontSize: 12, color: 'var(--iff-subtext)' }}>Nothing recorded.</span>
            )}
            {onTrade.map((a) => (
              <div key={a.assetId} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                <span style={{ flex: 1 }}>
                  {a.displayName}
                  <span style={{ color: 'var(--iff-subtext)' }}>
                    {' '}— sent by {a.side === 'assetsFromProposer' ? trade.proposingTeamName : trade.receivingTeamName}
                  </span>
                </span>
                <button
                  onClick={() => drop(a)}
                  disabled={busy}
                  aria-label={`Remove ${a.displayName}`}
                  style={{ fontSize: 12, color: '#EF4444', padding: '2px 8px' }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select value={assetId} onChange={(e) => setAssetId(e.target.value)} style={{ flex: 1, minWidth: 200 }}>
              <option value="">Add a missing asset…</option>
              {candidates.map((a) => (
                <option key={a.assetId} value={a.assetId}>
                  {a.isPick ? '📋 ' : ''}{a.name} ({a.teamName})
                </option>
              ))}
            </select>
            <button className="btn-primary" onClick={add} disabled={!assetId || busy} style={{ padding: '8px 18px', fontSize: 13 }}>
              {busy ? 'Working…' : 'Add to trade'}
            </button>
          </div>

          {trade.status === 'completed' && (
            <button
              className="btn-outline"
              onClick={reverse}
              disabled={busy}
              style={{ alignSelf: 'flex-start', borderColor: '#EF4444', color: '#EF4444', fontSize: 12, padding: '6px 14px' }}
            >
              ↩ Reverse this whole trade
            </button>
          )}
          {trade.status === 'reversed' && (
            <div style={{ fontSize: 12, color: 'var(--iff-subtext)' }}>
              This trade was reversed{trade.reverseReason ? ` — ${trade.reverseReason}` : ''}.
            </div>
          )}
        </>
      )}

      {msg && (
        <div style={{ fontSize: 12, color: msg.ok ? '#4ADE80' : '#EF4444', lineHeight: 1.5 }}>
          {msg.text}
        </div>
      )}
    </div>
  )
}
