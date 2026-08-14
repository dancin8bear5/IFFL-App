// DashboardView — port of Views/DashboardView.swift.
// Mobile: single-column stack under the hero (unchanged from v1).
// Desktop: page heading + two-column grid — main (team card, calendar,
// teams, trades) and rail (trophy room, matches, messages).
import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { useIsDesktop } from '../hooks/useBreakpoint'
import { fantasyTeams, teamByName, milestones } from '../data/staticData'
import { formatTradeDate } from '../services/models'
import { SectionHeader, TeamAvatar, BeltRow, LoadingList, PosBadge } from '../components/shared'
import AssetDetailView from '../components/AssetDetailView'
import TradeDetailView from '../components/TradeDetailView'
import TrophyRoomView from '../components/TrophyRoomView'
import { LastSeasonView, LeagueHistoryTable } from '../components/LeagueHistoryViews'
import RulesOverlay, { categoryMeta } from '../components/RulesView'
import TransactionLedger from '../components/TransactionLedger'
import ParlayView from '../components/ParlayView'
import SettingsView from './SettingsView'
import { useEffect } from 'react'

export default function DashboardView({ setTab }) {
  const {
    userTeam, allDisplayAssets, activeSeason, myMatchCount, trades, messages,
    isInitialLoadComplete, userSettings, setSelectedTeam, proposeTradeFor,
    incomingOffers, leagueHistory, loadLeagueHistory,
    rules, rulesVotingOpen, transactions,
    parlayConfig, parlayEntries, areaEnabled,
  } = useApp()
  const isDesktop = useIsDesktop()
  const [showSettings, setShowSettings] = useState(false)
  const [detailAsset, setDetailAsset] = useState(null)
  const [detailTrade, setDetailTrade] = useState(null)
  const [historyView, setHistoryView] = useState(null) // 'last' | 'table' | 'trophy'
  const [showRules, setShowRules] = useState(false)
  const [showLedger, setShowLedger] = useState(false)
  const [showParlay, setShowParlay] = useState(false)

  useEffect(() => {
    loadLeagueHistory()
  }, [loadLeagueHistory])

  const myAssets = useMemo(
    () => allDisplayAssets.filter((a) => a.teamName === userTeam),
    [allDisplayAssets, userTeam],
  )
  const myTopAssets = useMemo(
    () => myAssets.filter((a) => !a.isPick).sort((a, b) => b.currentPrice - a.currentPrice).slice(0, 3),
    [myAssets],
  )
  const myCapTotal = useMemo(() => myAssets.reduce((sum, a) => sum + a.currentPrice, 0), [myAssets])
  const belts = teamByName[userTeam]?.beltWins ?? 0

  const recentTrades = useMemo(
    () =>
      trades
        .filter((t) => t.status === 'completed' || t.status === 'historical')
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 5),
    [trades],
  )

  // Next 3 milestones only — keeps the calendar strip tight
  const upcoming = useMemo(() => {
    const now = new Date()
    return milestones.filter((m) => m.date > now).slice(0, 3)
  }, [])

  function openTeam(name) {
    setSelectedTeam(name)
    setTab(1)
  }

  function handleProposeTrade(asset) {
    setDetailAsset(null)
    proposeTradeFor(asset)
    setTab(3)
  }

  // ── Sections (identical building blocks on both layouts) ──────

  const teamCard = (
    <div className="iff-card">
      <div style={{ padding: '14px 16px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--iff-subtext)', marginBottom: 3 }}>My Team</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 24, fontWeight: 900, letterSpacing: -0.8 }}>{userTeam || '—'}</span>
            <BeltRow count={belts} size={11} />
          </div>
          {belts > 0 && (
            <div style={{ fontSize: 10, color: 'var(--iff-gold)', opacity: 0.85, marginTop: 2 }}>
              {belts}× League Champion
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid var(--iff-divider)', borderBottom: '1px solid var(--iff-divider)' }}>
        <div style={{ textAlign: 'center', padding: '10px 8px' }}>
          <div className="tnum" style={{ fontSize: 17, fontWeight: 700, color: 'var(--iff-gold)' }}>${myCapTotal}</div>
          <div style={{ fontSize: 10, color: 'var(--iff-subtext)' }}>{activeSeason} Cap</div>
        </div>
        <div style={{ textAlign: 'center', padding: '10px 8px', borderLeft: '1px solid var(--iff-divider)' }}>
          <div className="tnum" style={{ fontSize: 17, fontWeight: 700, color: 'var(--iff-gold)' }}>{myMatchCount}</div>
          <div style={{ fontSize: 10, color: 'var(--iff-subtext)' }}>Trade Matches</div>
        </div>
      </div>

      {myTopAssets.length > 0 && (
        <div style={{ padding: '10px 16px 12px', borderBottom: '1px solid var(--iff-divider)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--iff-subtext)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 7 }}>
            Top Players
          </div>
          {myTopAssets.map((a) => (
            <button
              key={a.id}
              onClick={() => setDetailAsset(a)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', width: '100%', textAlign: 'left' }}
            >
              <PosBadge position={a.position} />
              <span style={{ fontSize: 14, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</span>
              <span className="tnum green" style={{ fontSize: 14, fontWeight: 700 }}>${a.currentPrice}</span>
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '12px 16px' }}>
        <button className="btn-outline" onClick={() => setTab(1)}>👥 Roster</button>
        <button className="btn-outline" onClick={() => setTab(3)}>⇄ Market</button>
      </div>
    </div>
  )

  // Incoming trade offers — the ESPN-style "you've got an offer" alert
  const offerBanners = incomingOffers.length > 0 && (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {incomingOffers.map((t) => (
        <button
          key={t.id}
          className="iff-card offer-banner"
          onClick={() => setDetailTrade(t)}
          style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
            textAlign: 'left', width: '100%',
            border: '1.5px solid rgba(230,57,70,0.45)',
            background: 'linear-gradient(135deg, rgba(230,57,70,0.14), var(--iff-surface) 55%)',
          }}
        >
          <span style={{ width: 42, height: 42, background: 'rgba(230,57,70,0.2)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>📨</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 14, fontWeight: 800 }}>
              {t.proposingTeamName} sent you a trade offer
            </span>
            <span style={{ display: 'block', fontSize: 11, color: 'var(--iff-subtext)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              You get: {(t.assetsFromProposer ?? []).map((a) => a.displayName).join(', ') || '—'}
            </span>
          </span>
          <span className="btn-outline" style={{ fontSize: 11, padding: '5px 12px', pointerEvents: 'none' }}>
            Respond
          </span>
        </button>
      ))}
    </div>
  )

  const latestSeasonYear = leagueHistory[0]?.season
  const historyTiles = areaEnabled('history') && (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <HistoryTile
        glyph="📊"
        title="Last Season"
        sub={latestSeasonYear ? `${latestSeasonYear} final standings & champion` : 'Final standings & champion'}
        onClick={() => setHistoryView('last')}
      />
      <HistoryTile
        glyph="📜"
        title="League History"
        sub="All-time table — every stat, sortable"
        onClick={() => setHistoryView('table')}
      />
      <HistoryTile
        glyph="🏆"
        title="Trophy Room"
        sub="Banners, belts & the hall of franchises"
        onClick={() => setHistoryView('trophy')}
        gold
      />
    </div>
  )

  const matchBanner = myMatchCount > 0 && (
    <button className="iff-card" onClick={() => setTab(3)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', textAlign: 'left', width: '100%' }}>
      <span style={{ width: 40, height: 40, background: 'rgba(230,57,70,0.15)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0 }}>⇄</span>
      <span style={{ flex: 1 }}>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 700 }}>
          {myMatchCount} Trade Match{myMatchCount === 1 ? '' : 'es'}
        </span>
        <span style={{ display: 'block', fontSize: 11, color: 'var(--iff-subtext)', marginTop: 2 }}>
          Mutual trade interest detected
        </span>
      </span>
      <span style={{ fontSize: 12, color: 'var(--iff-subtext)' }}>›</span>
    </button>
  )

  const calendar = upcoming.length > 0 && (
    <div>
      <SectionHeader title="League Calendar" />
      {isDesktop ? (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 10 }}>
          {upcoming.map((m) => (
            <MilestoneCard key={m.name} milestone={m} />
          ))}
        </div>
      ) : (
        <div style={{ overflowX: 'auto', margin: '10px -14px 0', padding: '0 14px' }}>
          <div style={{ display: 'flex', gap: 12, width: 'max-content', padding: '2px 2px 6px' }}>
            {upcoming.map((m) => (
              <MilestoneCard key={m.name} milestone={m} />
            ))}
          </div>
        </div>
      )}
    </div>
  )

  const teamsGrid = (
    <div>
      <SectionHeader title="All Teams" />
      <div className="team-grid-cards">
        {fantasyTeams.map((team) => (
          <button
            key={team.name}
            className="iff-card"
            onClick={() => openTeam(team.name)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              padding: '10px 4px', borderRadius: 12,
              outline: team.name === userTeam ? '2px solid var(--iff-accent)' : 'none',
              outlineOffset: -2,
            }}
          >
            <TeamAvatar name={team.name} />
            <span style={{ fontSize: 9.5, fontWeight: 600, lineHeight: 1.2 }}>{team.name}</span>
            <BeltRow count={team.beltWins} size={8} />
          </button>
        ))}
      </div>
    </div>
  )

  // Low Points Parlay — loud while a week is open, showing whether you're in
  const myParlayEntry = parlayEntries.find((e) => e.teamName === userTeam)
  const parlayCard = areaEnabled('parlay') && parlayConfig?.open && (
    <button
      className="iff-card"
      onClick={() => setShowParlay(true)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', width: '100%', textAlign: 'left',
        border: myParlayEntry ? '1px solid transparent' : '1.5px solid rgba(244,162,97,0.55)',
      }}
    >
      <span style={{ fontSize: 16 }}>🎯</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>
          Low Points Parlay — Week {parlayConfig.week}
        </span>
        <span style={{ display: 'block', fontSize: 10.5, color: myParlayEntry ? 'var(--iff-green)' : 'var(--iff-gold)', marginTop: 1 }}>
          {myParlayEntry ? `✓ In with ${myParlayEntry.playerName}` : 'Pick your TD scorer before lock'}
        </span>
      </span>
      <span className="tnum" style={{ fontSize: 11, color: 'var(--iff-subtext)' }}>
        {parlayEntries.length}/12 ›
      </span>
    </button>
  )

  // Slim link into the full transaction ledger — trades, drops, claims,
  // clears — the league's paper trail once the season starts.
  const ledgerLink = areaEnabled('ledger') && (
    <button
      className="iff-card"
      onClick={() => setShowLedger(true)}
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', width: '100%', textAlign: 'left' }}
    >
      <span style={{ fontSize: 16 }}>🧾</span>
      <span style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>Transaction Log</span>
      <span style={{ fontSize: 11, color: 'var(--iff-subtext)' }}>
        {transactions.length > 0 ? `${transactions.length} events ›` : '›'}
      </span>
    </button>
  )

  const tradesSection = recentTrades.length > 0 && (
    <div>
      <SectionHeader title="Recent Trades" actionLabel="See All" onAction={() => setTab(3)} />
      <div className="iff-card" style={{ marginTop: 10 }}>
        {recentTrades.map((t, i) => (
          <div
            key={t.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
              borderBottom: i < recentTrades.length - 1 ? '1px solid var(--iff-divider)' : 'none',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>
                {t.proposingTeamName} ↔ {t.receivingTeamName}
              </div>
              <div style={{ fontSize: 10, color: 'var(--iff-subtext)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {(t.assetsFromProposer ?? []).slice(0, 2).map((a) => a.displayName).join(', ') ||
                  (t.historicalProposerAssets ?? []).slice(0, 2).join(', ')}
              </div>
            </div>
            <div style={{ fontSize: 10, color: 'var(--iff-subtext)', whiteSpace: 'nowrap' }}>
              {formatTradeDate(t.date)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  // League standings — absorbed from the retired League tab
  const latestSeason = leagueHistory[0]
  const standingsSection = latestSeason?.standings?.length > 0 && (
    <div>
      <SectionHeader title={`${latestSeason.season} Standings`} actionLabel="Full history" onAction={() => setHistoryView('table')} />
      <div className="iff-card" style={{ marginTop: 10, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '26px 1fr 52px 62px', padding: '9px 14px', fontSize: 10, fontWeight: 700, color: 'var(--iff-subtext)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid var(--iff-divider)' }}>
          <span /><span>Team</span><span style={{ textAlign: 'center' }}>W-L</span><span style={{ textAlign: 'right' }}>PF</span>
        </div>
        {[...latestSeason.standings].sort((a, b) => a.place - b.place).map((s) => (
          <div
            key={s.teamName}
            style={{
              display: 'grid', gridTemplateColumns: '26px 1fr 52px 62px', padding: '7px 14px',
              fontSize: 13, alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.03)',
              background: s.teamName === userTeam ? 'rgba(230,57,70,0.08)' : 'transparent',
            }}
          >
            <span className="tnum" style={{ fontWeight: 700, color: s.place === 1 ? 'var(--iff-gold)' : s.place === 2 ? '#B8B8C8' : s.place === 3 ? '#CD7F32' : 'var(--iff-subtext)' }}>
              {s.place}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
              <TeamAvatar name={s.teamName} size={20} />
              <span style={{ fontWeight: s.teamName === userTeam ? 700 : 400 }}>{s.teamName}</span>
              <BeltRow count={teamByName[s.teamName]?.beltWins ?? 0} size={8} />
            </span>
            <span className="tnum" style={{ textAlign: 'center', color: 'var(--iff-subtext)', fontSize: 12 }}>{s.record ?? '—'}</span>
            <span className="tnum" style={{ textAlign: 'right', fontSize: 12, color: s.place <= 6 ? 'var(--iff-green)' : 'var(--iff-subtext)' }}>
              {s.pointsFor != null ? s.pointsFor.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )

  // Rules & Reminders — new rules read like league announcements
  const seasonRules = rules.filter((r) => r.status === 'passed' && r.decidedSeason === activeSeason)
  const openProposals = rules.filter((r) => r.status === 'proposed')
  const rulesSection = areaEnabled('rules') && (
    <div>
      <SectionHeader title="Rules & Reminders" actionLabel="All rules ›" onAction={() => setShowRules(true)} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>

        {rulesVotingOpen && (
          <button
            className="iff-card"
            onClick={() => setShowRules(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', textAlign: 'left', width: '100%',
              border: '1.5px solid rgba(74,222,128,0.5)',
              background: 'linear-gradient(135deg, rgba(74,222,128,0.14), var(--iff-surface) 60%)',
            }}
          >
            <span style={{ fontSize: 20 }}>🗳️</span>
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: 13.5, fontWeight: 800 }}>Voting is open</span>
              <span style={{ display: 'block', fontSize: 11, color: 'var(--iff-subtext)', marginTop: 2 }}>
                {openProposals.length} proposal{openProposals.length === 1 ? '' : 's'} need your vote
              </span>
            </span>
            <span style={{ fontSize: 12, color: 'var(--iff-subtext)' }}>›</span>
          </button>
        )}

        {seasonRules.map((r) => {
          const meta = categoryMeta(r.category)
          return (
            <button
              key={r.id}
              className="iff-card"
              onClick={() => setShowRules(true)}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '13px 16px', textAlign: 'left', width: '100%', borderLeft: '3px solid var(--iff-green)' }}
            >
              <span style={{ fontSize: 17, lineHeight: 1.2 }}>📌</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: meta.color, background: `${meta.color}22`, padding: '2px 6px', borderRadius: 5 }}>
                    {meta.glyph} {r.category ?? 'Misc'}
                  </span>
                  <span style={{ fontSize: 13.5, fontWeight: 700 }}>{r.title}</span>
                </span>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--iff-subtext)', marginTop: 4, lineHeight: 1.45 }}>
                  {r.summary ?? r.details ?? ''}
                </span>
                {(r.changes ?? []).length > 0 && (
                  <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                    {r.changes.map((c, i) => (
                      <span key={i} className="tnum" style={{ fontSize: 10, background: 'var(--iff-elevated)', padding: '2px 7px', borderRadius: 5, color: 'var(--iff-subtext)' }}>
                        {c.rule}: <span style={{ textDecoration: 'line-through' }}>{c.currentValue || '—'}</span>{' → '}
                        <strong style={{ color: 'var(--iff-green)' }}>{c.newValue}</strong>
                      </span>
                    ))}
                  </span>
                )}
                <span style={{ display: 'block', fontSize: 9.5, color: 'var(--iff-subtext)', marginTop: 5 }}>
                  NEW FOR {activeSeason} · passed {activeSeason}
                </span>
              </span>
            </button>
          )
        })}

        {!rulesVotingOpen && openProposals.length > 0 && (
          <button
            className="iff-card"
            onClick={() => setShowRules(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', textAlign: 'left', width: '100%' }}
          >
            <span style={{ fontSize: 18 }}>📜</span>
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>
                {openProposals.length} rule proposal{openProposals.length === 1 ? '' : 's'} on the table
              </span>
              <span style={{ display: 'block', fontSize: 11, color: 'var(--iff-subtext)', marginTop: 2 }}>
                Voting opens on voting day — read them now
              </span>
            </span>
            <span style={{ fontSize: 12, color: 'var(--iff-subtext)' }}>›</span>
          </button>
        )}

        <button
          className="btn-outline"
          onClick={() => setShowRules(true)}
          style={{ alignSelf: 'flex-start', fontSize: 12, padding: '7px 16px' }}
        >
          ＋ Propose a rule
        </button>
      </div>
    </div>
  )

  const messagesSection = areaEnabled('messages') && messages.length > 0 && (
    <div>
      <SectionHeader title="League Messages" />
      {isDesktop ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
          {messages.map((m) => (
            <div key={m.id} className="iff-card" style={{ padding: 14, fontSize: 13, lineHeight: 1.5 }}>
              {m.content}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ overflowX: 'auto', margin: '10px -14px 0', padding: '0 14px' }}>
          <div style={{ display: 'flex', gap: 12, width: 'max-content', padding: '2px 2px 6px' }}>
            {messages.map((m) => (
              <div key={m.id} className="iff-card" style={{ padding: 14, width: 260, fontSize: 13, lineHeight: 1.5 }}>
                {m.content}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  const overlays = (
    <>
      {showSettings && <SettingsView onClose={() => setShowSettings(false)} />}
      {detailAsset && (
        <AssetDetailView
          asset={detailAsset}
          onBack={() => setDetailAsset(null)}
          onProposeTrade={handleProposeTrade}
          desktop="panel"
        />
      )}
      {detailTrade && <TradeDetailView trade={detailTrade} onClose={() => setDetailTrade(null)} />}
      {historyView === 'last' && <LastSeasonView onClose={() => setHistoryView(null)} />}
      {historyView === 'table' && <LeagueHistoryTable onClose={() => setHistoryView(null)} />}
      {historyView === 'trophy' && <TrophyRoomView onClose={() => setHistoryView(null)} />}
      {showRules && <RulesOverlay onClose={() => setShowRules(false)} />}
      {showLedger && <TransactionLedger onClose={() => setShowLedger(false)} />}
      {showParlay && <ParlayView onClose={() => setShowParlay(false)} />}
    </>
  )

  // ── Desktop layout ─────────────────────────────────────────

  if (isDesktop) {
    return (
      <div>
        <div className="dash-hero-desktop">
          <h1>Dashboard</h1>
          <span className="season-chip">Season {activeSeason} · EST. 2008</span>
        </div>
        {!isInitialLoadComplete ? (
          <LoadingList count={4} />
        ) : (
          <div className="dash-grid">
            <div className="dash-main">
              {offerBanners}
              {parlayCard}
              {teamCard}
              {calendar}
              {teamsGrid}
              {standingsSection}
              {tradesSection}
              {ledgerLink}
            </div>
            <div className="dash-rail">
              {historyTiles}
              {matchBanner}
              {messagesSection}
              {rulesSection}
            </div>
          </div>
        )}
        {overlays}
      </div>
    )
  }

  // ── Mobile layout (unchanged) ──────────────────────────────

  return (
    <div>
      <header className="dash-hero-mobile" style={{ textAlign: 'center', padding: '24px 16px 4px', position: 'relative' }}>
        <button
          className="icon-btn"
          style={{ position: 'absolute', top: 8, right: 10 }}
          onClick={() => setShowSettings(true)}
          aria-label="Settings"
        >
          ⚙
        </button>
        <div style={{ fontSize: 46, fontWeight: 900, fontStyle: 'italic', letterSpacing: '-2px', color: 'var(--iff-accent)', lineHeight: 1.05 }}>
          Insanity League
        </div>
        <div style={{ fontSize: 12, color: 'var(--iff-subtext)', marginTop: 6 }}>Fantasy Football League</div>
        <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(158,168,184,0.5)', letterSpacing: 4, marginTop: 3 }}>
          EST. 2008
        </div>
      </header>

      {!isInitialLoadComplete ? (
        <LoadingList count={4} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '12px 14px 0' }}>
          {offerBanners}
          {parlayCard}
          {teamCard}
          {historyTiles}
          {matchBanner}
          {calendar}
          {teamsGrid}
          {standingsSection}
          {tradesSection}
          {ledgerLink}
          {messagesSection}
          {rulesSection}
        </div>
      )}
      {overlays}
    </div>
  )
}

function MilestoneCard({ milestone }) {
  const now = new Date()
  const days = Math.round((milestone.date - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000)
  const daysLabel = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days} days`
  const month = milestone.date.toLocaleString('en-US', { month: 'short' }).toUpperCase()

  return (
    <div className="iff-card" style={{ width: 110, overflow: 'hidden', flexShrink: 0 }}>
      <div style={{ height: 4, background: milestone.color, borderRadius: '12px 12px 0 0' }} />
      <div style={{ padding: '10px 10px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 38, height: 38, borderRadius: '50%', background: `${milestone.color}26`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>
          {milestone.icon}
        </span>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: milestone.color, letterSpacing: 0.5 }}>{month}</div>
          <div style={{ fontSize: 26, fontWeight: 900, lineHeight: 1 }}>{milestone.date.getDate()}</div>
        </div>
        <div style={{ fontSize: 10, fontWeight: 600, textAlign: 'center', lineHeight: 1.3 }}>{milestone.name}</div>
        <span style={{ fontSize: 9, fontWeight: 600, color: milestone.color, background: `${milestone.color}1F`, padding: '2px 8px', borderRadius: 20 }}>
          {daysLabel}
        </span>
      </div>
    </div>
  )
}

function HistoryTile({ glyph, title, sub, onClick, gold }) {
  return (
    <button
      className="iff-card"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
        textAlign: 'left', width: '100%',
        ...(gold ? { background: 'linear-gradient(135deg, rgba(244,162,97,0.14), var(--iff-surface) 60%)' } : {}),
      }}
    >
      <span style={{ width: 44, height: 44, background: gold ? 'rgba(244,162,97,0.2)' : 'var(--iff-elevated)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
        {glyph}
      </span>
      <span style={{ flex: 1 }}>
        <span style={{ display: 'block', fontSize: 15, fontWeight: 600 }}>{title}</span>
        <span style={{ display: 'block', fontSize: 11, color: 'var(--iff-subtext)', marginTop: 2 }}>{sub}</span>
      </span>
      <span style={{ fontSize: 12, color: 'var(--iff-subtext)' }}>›</span>
    </button>
  )
}
