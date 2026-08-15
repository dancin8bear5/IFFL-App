// MarketView — port of Views/MarketView.swift.
// Three sections: Interest (FMK swiper), Matches, Trades.
import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { useIsDesktop } from '../hooks/useBreakpoint'
import { Segmented, TeamAvatar } from '../components/shared'
import { formatTradeDate } from '../services/models'
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
  const [section, setSection] = useState('Interest')
  const [showSettings, setShowSettings] = useState(false)
  const [showProposal, setShowProposal] = useState(false)
  const [detailTrade, setDetailTrade] = useState(null)
  const [search, setSearch] = useState('')

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
  const completed = useMemo(() => {
    let list = trades.filter((t) => t.status === 'completed' || t.status === 'historical')
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
    return list.sort((a, b) => new Date(b.date) - new Date(a.date))
  }, [trades, search])

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
          <h1>F.M.K. Market</h1>
          <button className="btn-outline" onClick={() => setShowProposal(true)} style={{ fontSize: 12, padding: '7px 16px' }}>
            ＋ Propose Trade
          </button>
        </div>

        <div className="market-grid">
          <div className="market-main">
            <FMKGuide />
            <div className="iff-card" style={{ padding: '4px 0 16px' }}>
              <FMKSwiperCard />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 16, fontWeight: 700 }}>Trade Ledger</span>
                <input
                  type="search"
                  placeholder="Search by team or player…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ width: 260 }}
                />
              </div>
              {completed.length === 0 ? (
                <div className="iff-card empty-state" style={{ padding: '32px 24px' }}>
                  <div>No completed trades this season.</div>
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

      <Segmented options={['Interest', 'Matches', 'Trades']} value={section} onChange={setSection} />

      {section === 'Interest' && (
        <>
          <div style={{ padding: '12px 14px 0' }}>
            <FMKGuide />
          </div>
          <FMKSwiperCard />
        </>
      )}

      {section === 'Matches' && (
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

      {section === 'Trades' && (
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
              Completed
            </div>
            <input
              type="search"
              placeholder="Search by team or player…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ marginBottom: 10 }}
            />
            {completed.length === 0 ? (
              <div className="empty-state" style={{ padding: '32px 24px' }}>
                <div>No completed trades this season.</div>
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
  const assets = (trade.assetsFromProposer ?? []).map((a) => a.displayName)
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
        <span style={{ display: 'block', fontSize: 10, color: 'var(--iff-subtext)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {assets.slice(0, 2).join(', ') || (trade.historicalProposerAssets ?? []).slice(0, 2).join(', ')}
        </span>
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
