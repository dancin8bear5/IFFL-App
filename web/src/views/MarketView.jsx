// MarketView — port of Views/MarketView.swift.
// Three sections: Interest (FMK swiper), Matches, Trades.
import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { FMK_ENABLED } from '../data/staticData'
import { useIsDesktop } from '../hooks/useBreakpoint'
import { Segmented, TeamAvatar } from '../components/shared'
import { formatTradeDate } from '../services/models'
import { fantasyTeams } from '../data/staticData'
import FMKSwiperCard from '../components/FMKSwiperCard'
import TradeProposalView from '../components/TradeProposalView'
import TradeDetailView from '../components/TradeDetailView'
import SettingsView from './SettingsView'

/**
 * Plain-english F.M.K. primer — this flow is brand new to the league,
 * so the whole game is explained in as few words as possible.
 */
function FMKGuide() {
  const [open, setOpen] = useState(true)
  return (
    <div className="iff-card" style={{ overflow: 'hidden' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '11px 14px', textAlign: 'left' }}
      >
        <span style={{ fontSize: 15 }}>🎓</span>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 800 }}>How F.M.K. works</span>
        <span style={{ fontSize: 11, color: 'var(--iff-subtext)' }}>{open ? '▴ hide' : '▾ show'}</span>
      </button>
      {open && (
        <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12, lineHeight: 1.5 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={{ flexShrink: 0 }}>🔥</span>
            <span><b style={{ color: 'var(--iff-gold)' }}>F — swipe right.</b> I want to trade for this player.</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={{ flexShrink: 0 }}>💍</span>
            <span><b style={{ color: '#22C55E' }}>Marry — swipe up.</b> Elite — I'd build my team around them. Counts as wanting them too.</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={{ flexShrink: 0 }}>💀</span>
            <span><b style={{ color: '#EF4444' }}>Kill — swipe left.</b> Not interested. Skips the player, tells no one.</span>
          </div>
          <div style={{ borderTop: '1px solid var(--iff-divider)', paddingTop: 8, display: 'flex', gap: 8 }}>
            <span style={{ flexShrink: 0 }}>🤝</span>
            <span>
              <b>Matches:</b> when you 🔥/💍 someone's player AND they 🔥/💍 one of yours at a similar
              price, that's a <b>Match</b> — find yours in the <b>Matches</b> tab (the red badge counts them).
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={{ flexShrink: 0 }}>📨</span>
            <span>
              <b>Do something about it:</b> open a match → <b>Propose Trade</b> — the trade form comes
              pre-filled with both players. They accept, decline, or counter. Nobody sees your swipes,
              only mutual matches.
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

export default function MarketView({ setTab }) {
  const isDesktop = useIsDesktop()
  const {
    matches, userTeam, trades, triggerTradeProposal, setTriggerTradeProposal,
    loadAllLeagueInterests,
  } = useApp()
  // F.M.K. is off for EVERYONE, commissioner included — see FMK_ENABLED in
  // staticData.js. The trade portal below is untouched; this tab is now
  // just the trade portal and is titled accordingly.
  const fmkOn = FMK_ENABLED
  const [section, setSection] = useState(fmkOn ? 'Interest' : 'Trades')
  const [showSettings, setShowSettings] = useState(false)
  const [showProposal, setShowProposal] = useState(false)
  const [detailTrade, setDetailTrade] = useState(null)
  const [search, setSearch] = useState('')
  const [seasonFilter, setSeasonFilter] = useState('all')
  const [teamFilter, setTeamFilter] = useState('all')

  useEffect(() => {
    loadAllLeagueInterests()
  }, [loadAllLeagueInterests])

  // AssetDetail "Propose Trade" cross-tab trigger
  useEffect(() => {
    if (triggerTradeProposal) {
      setShowProposal(true)
      setTriggerTradeProposal(false)
    }
  }, [triggerTradeProposal, setTriggerTradeProposal])

  const myMatches = useMemo(
    () => matches.filter((m) => m.teamA === userTeam || m.teamB === userTeam),
    [matches, userTeam],
  )

  const pending = useMemo(
    () => trades.filter((t) => t.status === 'proposed' || t.status === 'accepted'),
    [trades],
  )
  const doneTrades = useMemo(
    () => trades.filter((t) => t.status === 'completed' || t.status === 'historical'),
    [trades],
  )

  /**
   * Seasons that actually have trades, newest first. Derived from the data
   * rather than a fixed range so a freshly-seeded historical year shows up
   * on its own. Trades predating the `season` field fall into 'Undated'.
   */
  const tradeSeasons = useMemo(() => {
    const years = new Set()
    let hasUndated = false
    for (const t of doneTrades) {
      if (t.season == null) hasUndated = true
      else years.add(Number(t.season))
    }
    return {
      years: [...years].sort((a, b) => b - a),
      hasUndated,
    }
  }, [doneTrades])

  const completed = useMemo(() => {
    let list = doneTrades

    if (seasonFilter !== 'all') {
      list = list.filter((t) =>
        seasonFilter === 'undated' ? t.season == null : Number(t.season) === Number(seasonFilter))
    }

    // "By team" means every trade that team was on either side of.
    if (teamFilter !== 'all') {
      list = list.filter((t) => t.proposingTeamName === teamFilter || t.receivingTeamName === teamFilter)
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (t) =>
          t.proposingTeamName.toLowerCase().includes(q) ||
          t.receivingTeamName.toLowerCase().includes(q) ||
          [...(t.assetsFromProposer ?? []), ...(t.assetsFromReceiver ?? [])].some((a) =>
            a.displayName.toLowerCase().includes(q),
          ),
      )
    }
    return [...list].sort((a, b) => new Date(b.date) - new Date(a.date))
  }, [doneTrades, search, seasonFilter, teamFilter])

  const ledgerFiltered = seasonFilter !== 'all' || teamFilter !== 'all' || search.trim() !== ''

  // Season / team filter controls — shared by the desktop and mobile ledgers.
  const ledgerFilters = (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <select
        value={seasonFilter}
        onChange={(e) => setSeasonFilter(e.target.value)}
        aria-label="Filter trades by season"
        style={{ width: 'auto', minWidth: 104, fontSize: 12, padding: '7px 9px' }}
      >
        <option value="all">All seasons</option>
        {tradeSeasons.years.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
        {tradeSeasons.hasUndated && <option value="undated">Undated</option>}
      </select>

      <select
        value={teamFilter}
        onChange={(e) => setTeamFilter(e.target.value)}
        aria-label="Filter trades by team"
        style={{ width: 'auto', minWidth: 112, fontSize: 12, padding: '7px 9px' }}
      >
        <option value="all">All teams</option>
        {fantasyTeams.map((t) => (
          <option key={t.name} value={t.name}>{t.name}</option>
        ))}
      </select>

      {ledgerFiltered && (
        <button
          onClick={() => { setSeasonFilter('all'); setTeamFilter('all'); setSearch('') }}
          style={{ fontSize: 11, fontWeight: 700, color: 'var(--iff-accent)', whiteSpace: 'nowrap' }}
        >
          Clear ✕
        </button>
      )}
    </div>
  )

  const ledgerEmptyText = ledgerFiltered
    ? 'No trades match these filters.'
    : 'No completed trades yet.'

  const overlays = (
    <>
      {showSettings && <SettingsView onClose={() => setShowSettings(false)} />}
      {showProposal && <TradeProposalView onClose={() => setShowProposal(false)} />}
      {detailTrade && <TradeDetailView trade={detailTrade} onClose={() => setDetailTrade(null)} />}
    </>
  )

  // ── Desktop: swiper + live rail + trade ledger ─────────────
  if (isDesktop) {
    return (
      <div>
        <div className="dash-hero-desktop">
          <h1>{fmkOn ? 'F.M.K. Market' : 'Trades'}</h1>
          <button className="btn-outline" onClick={() => setShowProposal(true)} style={{ fontSize: 12, padding: '7px 16px' }}>
            ＋ Propose Trade
          </button>
        </div>

        <div className="market-grid">
          <div className="market-main">
            {fmkOn && (
              <>
                <FMKGuide />
                <div className="iff-card" style={{ padding: '4px 0 16px' }}>
                  <FMKSwiperCard />
                </div>
              </>
            )}

            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 12 }}>
                <span style={{ fontSize: 16, fontWeight: 700, whiteSpace: 'nowrap' }}>
                  Trade Ledger
                  <span className="tnum" style={{ marginLeft: 8, fontSize: 12, fontWeight: 400, color: 'var(--iff-subtext)' }}>
                    {completed.length}
                  </span>
                </span>
                <input
                  type="search"
                  placeholder="Search by team or player…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ width: 260 }}
                />
              </div>
              <div style={{ marginBottom: 10 }}>{ledgerFilters}</div>
              {completed.length === 0 ? (
                <div className="iff-card empty-state" style={{ padding: '32px 24px' }}>
                  <div>{ledgerEmptyText}</div>
                </div>
              ) : (
                <div className="iff-card">
                  {completed.map((t, i) => (
                    <TradeRow key={t.id} trade={t} last={i === completed.length - 1} onOpen={() => setDetailTrade(t)} />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="market-rail">
            {fmkOn && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--iff-subtext)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                Your Matches ({myMatches.length})
              </div>
              {myMatches.length === 0 ? (
                <div className="iff-card" style={{ padding: 16, fontSize: 12, color: 'var(--iff-subtext)', lineHeight: 1.6 }}>
                  Rate players in the deck — when another team wants your assets back, matches appear here live.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {myMatches.map((m) => (
                    <MatchCard key={m.id} match={m} userTeam={userTeam} onPropose={() => setShowProposal(true)} />
                  ))}
                </div>
              )}
            </div>
            )}

            {pending.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--iff-subtext)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                  Pending Trades
                </div>
                <div className="iff-card">
                  {pending.map((t, i) => (
                    <TradeRow key={t.id} trade={t} last={i === pending.length - 1} onOpen={() => setDetailTrade(t)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        {overlays}
      </div>
    )
  }

  // ── Mobile (unchanged) ─────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div className="nav-bar">
        <div className="nav-side" />
        <div className="nav-title">F.M.K. Market</div>
        <div className="nav-side right">
          <button className="icon-btn accent" onClick={() => setShowProposal(true)} aria-label="Propose trade">⊕</button>
          <button className="icon-btn" onClick={() => setShowSettings(true)} aria-label="Settings">⚙</button>
        </div>
      </div>

      {/* A single-option segmented control is just a label, so with F.M.K.
          off the switcher goes away entirely and Trades fills the tab. */}
      {fmkOn && (
        <Segmented options={['Interest', 'Matches', 'Trades']} value={section} onChange={setSection} />
      )}

      {fmkOn && section === 'Interest' && (
        <>
          <div style={{ padding: '12px 14px 0' }}>
            <FMKGuide />
          </div>
          <FMKSwiperCard />
        </>
      )}

      {fmkOn && section === 'Matches' && (
        <div>
          {myMatches.length === 0 ? (
            <div className="empty-state">
              <div className="glyph">🤝</div>
              <div className="title">No matches yet</div>
              <div>Rate players in the Interest tab — when another team wants your assets back, matches show up here.</div>
            </div>
          ) : (
            <div style={{ padding: '4px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {myMatches.map((m) => (
                <MatchCard key={m.id} match={m} userTeam={userTeam} onPropose={() => setShowProposal(true)} />
              ))}
            </div>
          )}
        </div>
      )}

      {(!fmkOn || section === 'Trades') && (
        <div style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {pending.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--iff-subtext)', textTransform: 'uppercase', letterSpacing: 0.5, padding: '6px 2px' }}>
                Pending
              </div>
              <div className="iff-card">
                {pending.map((t, i) => (
                  <TradeRow key={t.id} trade={t} last={i === pending.length - 1} onOpen={() => setDetailTrade(t)} />
                ))}
              </div>
            </div>
          )}

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--iff-subtext)', textTransform: 'uppercase', letterSpacing: 0.5, padding: '6px 2px' }}>
              Completed ({completed.length})
            </div>
            <input
              type="search"
              placeholder="Search by team or player…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ marginBottom: 10 }}
            />
            <div style={{ marginBottom: 10 }}>{ledgerFilters}</div>
            {completed.length === 0 ? (
              <div className="empty-state" style={{ padding: '32px 24px' }}>
                <div>{ledgerEmptyText}</div>
              </div>
            ) : (
              <div className="iff-card">
                {completed.map((t, i) => (
                  <TradeRow key={t.id} trade={t} last={i === completed.length - 1} onOpen={() => setDetailTrade(t)} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {overlays}
    </div>
  )
}

const STATUS_BADGE = {
  proposed:  { label: 'Proposed',  color: 'var(--iff-gold)', bg: 'rgba(244,162,97,0.15)' },
  accepted:  { label: 'Accepted',  color: '#22C55E', bg: 'rgba(34,197,94,0.15)' },
  countered: { label: 'Countered', color: '#38BDF8', bg: 'rgba(56,189,248,0.15)' },
  completed: { label: 'Completed', color: '#22C55E', bg: 'rgba(34,197,94,0.15)' },
  historical:{ label: 'History',   color: 'var(--iff-subtext)', bg: 'var(--iff-elevated)' },
  rejected:  { label: 'Declined',  color: '#EF4444', bg: 'rgba(239,68,68,0.15)' },
}

function TradeRow({ trade, last, onOpen }) {
  const badge = STATUS_BADGE[trade.status] ?? STATUS_BADGE.proposed
  // Both sides, framed as what each team RECEIVED — the row used to show one
  // side's outgoing assets with no label saying whose they were, which read
  // as "these are the proposer's players" when it meant the opposite.
  // assetsFrom<X> is what X sends, so each team's haul is the other's list.
  const names = (refs, fallback) =>
    (refs ?? []).map((a) => a.displayName).length
      ? refs.map((a) => a.displayName)
      : (fallback ?? [])
  const proposerGot = names(trade.assetsFromReceiver, trade.historicalReceiverAssets)
  const receiverGot = names(trade.assetsFromProposer, trade.historicalProposerAssets)
  const line = (team, got) =>
    got.length ? `${team} received ${got.slice(0, 2).join(', ')}${got.length > 2 ? ` +${got.length - 2}` : ''}` : null
  return (
    <button
      onClick={onOpen}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
        padding: '12px 14px', borderBottom: last ? 'none' : '1px solid var(--iff-divider)',
      }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>
          {trade.proposingTeamName} ↔ {trade.receivingTeamName}
        </span>
        {[
          line(trade.proposingTeamName, proposerGot),
          line(trade.receivingTeamName, receiverGot),
        ]
          .filter(Boolean)
          .map((text) => (
            <span
              key={text}
              style={{ display: 'block', fontSize: 10, color: 'var(--iff-subtext)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
            >
              {text}
            </span>
          ))}
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: badge.color, background: badge.bg, padding: '2px 7px', borderRadius: 6 }}>
          {badge.label}
        </span>
        <span style={{ fontSize: 10, color: 'var(--iff-subtext)' }}>{formatTradeDate(trade.date)}</span>
      </span>
    </button>
  )
}

function MatchCard({ match, userTeam, onPropose }) {
  const other = match.teamA === userTeam ? match.teamB : match.teamA
  const iWant = match.teamA === userTeam ? match.aWants : match.bWants
  const theyWant = match.teamA === userTeam ? match.bWants : match.aWants
  const glyphFor = (sig) => (sig === 'marry' ? '💍' : sig === 'fuck' ? '🔥' : '💀')

  return (
    <div className="iff-card" style={{ padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <TeamAvatar name={other} size={34} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Match with {other}</div>
          <div style={{ fontSize: 10, color: 'var(--iff-subtext)' }}>Score {match.matchScore}</div>
        </div>
        <button className="btn-outline" onClick={onPropose} style={{ fontSize: 11, padding: '5px 12px' }}>
          Propose
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--iff-subtext)', textTransform: 'uppercase', marginBottom: 4 }}>
            You want
          </div>
          {iWant.map((c) => (
            <div key={c.asset.id} style={{ padding: '2px 0' }}>
              {glyphFor(c.signal)} {c.asset.name}
            </div>
          ))}
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--iff-subtext)', textTransform: 'uppercase', marginBottom: 4 }}>
            They want
          </div>
          {theyWant.map((c) => (
            <div key={c.asset.id} style={{ padding: '2px 0' }}>
              {glyphFor(c.signal)} {c.asset.name}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
