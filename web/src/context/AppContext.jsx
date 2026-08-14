// AppContext — web port of AppState (App/CodeRedApp.swift).
// Holds auth state + all league data. On login it mirrors AppState.setup(for:):
// fetch config/league, resolve the user's team, attach the five snapshot
// listeners, and load the user's interests, FMK signals, and settings.
import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { listenToAuth } from '../services/authService'
import * as fs from '../services/firestoreService'
import { playerToDisplayAsset, pickToDisplayAsset } from '../services/models'
import { findMatches } from '../services/marketEngine'

const AppContext = createContext(null)

// Dev-only preview mode (?preview=1 under `npm run dev`): fills the context
// with sample data so screens can be tested without signing in. Dead code in
// production builds — import.meta.env.DEV is compile-time false there.
const DEV_PREVIEW =
  import.meta.env.DEV && new URLSearchParams(window.location.search).has('preview')

const DEFAULT_SETTINGS = {
  teamLogoName: null,
  displayNickname: null,
  defaultTab: 0,
  showTradeValues: true,
  fmkPublic: true,
  retroMode: false,
  accentColor: 'red',
  textSize: 'default',
  confetti: true,
}

export function AppProvider({ children }) {
  // Auth
  const [user, setUser] = useState(null)
  const [authReady, setAuthReady] = useState(false)

  // Mirrors of AppState @Published
  const [userTeam, setUserTeam] = useState('')
  const [selectedTeam, setSelectedTeam] = useState('')
  const [isCommissioner, setIsCommissioner] = useState(false)
  const [activeSeason, setActiveSeason] = useState(2026)
  const [isOffSeason, setIsOffSeason] = useState(false)
  const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false)
  const [players, setPlayers] = useState([])
  const [draftPicks, setDraftPicks] = useState([])
  const [trades, setTrades] = useState([])
  const [messages, setMessages] = useState([])
  const [interestedAssetIds, setInterestedAssetIds] = useState(new Set())
  const [allLeagueInterests, setAllLeagueInterests] = useState([])
  const [fmkSignals, setFmkSignals] = useState([])
  const [allLeagueFMK, setAllLeagueFMK] = useState([])
  const [userSettings, setUserSettings] = useState(DEFAULT_SETTINGS)
  const [didLoadSettings, setDidLoadSettings] = useState(false)
  const [leagueHistory, setLeagueHistory] = useState([])
  const [rules, setRules] = useState([])
  const [rulesVotingOpen, setRulesVotingOpen] = useState(false)
  const [transactions, setTransactions] = useState([])

  // Trade-proposal cross-tab trigger (AssetDetail → Market)
  const [selectedAssetForTrade, setSelectedAssetForTrade] = useState(null)
  const [triggerTradeProposal, setTriggerTradeProposal] = useState(false)

  const unsubsRef = useRef([])

  // Admin gate — same email check as AppState.isAdmin (preview mode: enabled for UI testing)
  const isAdmin = DEV_PREVIEW || user?.email === 'jaredrogtaylor@gmail.com'

  // ── Auth listener ───────────────────────────────────────────
  useEffect(() => {
    return listenToAuth((u) => {
      setUser(u)
      setAuthReady(true)
    })
  }, [])

  // Appearance (90s mode, accent color, text size) applied from saved settings
  useEffect(() => {
    import('../services/appearance').then(({ applyAppearance }) =>
      applyAppearance(userSettings, userTeam),
    )
  }, [userSettings.retroMode, userSettings.accentColor, userSettings.textSize, userTeam])

  // Dev preview: load sample data once instead of Firestore
  useEffect(() => {
    if (!DEV_PREVIEW) return
    import('../data/previewData').then((d) => {
      setUserTeam('Jared')
      setSelectedTeam('Jared')
      setPlayers(d.previewPlayers)
      setDraftPicks(d.previewPicks)
      setTrades(d.previewTrades)
      setMessages(d.previewMessages)
      setAllLeagueFMK(d.previewFMK)
      setLeagueHistory(d.previewHistory)
      setRules(d.previewRules ?? [])
      setTransactions(d.previewTransactions ?? [])
      setIsInitialLoadComplete(true)
      setDidLoadSettings(true)
    })
  }, [])

  // ── setup(for:) / teardown() ────────────────────────────────
  useEffect(() => {
    if (DEV_PREVIEW) return
    if (!user) {
      // teardown — mirror AppState.teardown()
      unsubsRef.current.forEach((unsub) => unsub())
      unsubsRef.current = []
      setPlayers([]); setDraftPicks([]); setTrades([]); setMessages([]); setTransactions([])
      setFmkSignals([]); setAllLeagueFMK([]); setInterestedAssetIds(new Set())
      setUserTeam(''); setSelectedTeam(''); setIsCommissioner(false)
      setIsInitialLoadComplete(false); setDidLoadSettings(false)
      setUserSettings(DEFAULT_SETTINGS)
      return
    }

    let cancelled = false
    const uid = user.uid

    async function setup() {
      // 1. League config → season, off-season flag, team, commissioner
      let season = 2026
      try {
        const config = await fs.fetchLeagueConfig()
        if (cancelled) return
        if (config) {
          season = config.activeSeasonYear ?? 2026
          setActiveSeason(season)
          setIsOffSeason(config.isOffSeason ?? false)
          setRulesVotingOpen(config.rulesVotingOpen ?? false)
          setIsCommissioner((config.authorizedUIDs ?? []).includes(uid))
          const team = config.userTeamMap?.[uid]
          if (team) {
            setUserTeam(team)
            setSelectedTeam(team)
          } else if (user.email) {
            // First sign-in: try auto-linking by verified Google email
            // (server-side match against config/league.teamEmailMap)
            try {
              const { getFunctionsClient } = await import('../firebase')
              const { httpsCallable } = await import('firebase/functions')
              const claim = httpsCallable(await getFunctionsClient(), 'claimTeam')
              const res = await claim()
              const claimed = res.data?.team
              if (!cancelled && claimed) {
                setUserTeam(claimed)
                setSelectedTeam(claimed)
              }
            } catch (err) {
              console.warn('claimTeam failed (falling back to manual assignment):', err.message)
            }
          }
        }
      } catch (err) {
        console.error('fetchLeagueConfig failed:', err)
      }

      if (cancelled) return

      // 2. Real-time listeners (players/picks/messages/FMK; trades via effect below)
      unsubsRef.current.push(
        fs.listenToPlayers((docs) => {
          setPlayers(docs)
          setIsInitialLoadComplete(true)
        }),
        fs.listenToDraftPicks(setDraftPicks),
        fs.listenToMessages(setMessages),
        fs.listenToAllFMKSignals(setAllLeagueFMK),
        fs.listenToRules(setRules),
        fs.listenToTransactions(setTransactions),
      )

      // 3. One-shot user loads
      fs.getPlayerInterests(uid)
        .then((docs) => !cancelled && setInterestedAssetIds(new Set(docs.map((d) => d.assetId))))
        .catch(() => {})
      fs.getFMKSignals(uid)
        .then((docs) => !cancelled && setFmkSignals(docs))
        .catch(() => {})
      fs.fetchUserSettings(uid)
        .then((s) => {
          if (cancelled) return
          if (s) setUserSettings({ ...DEFAULT_SETTINGS, ...s })
          setDidLoadSettings(true)
        })
        .catch(() => !cancelled && setDidLoadSettings(true))
    }

    setup()
    return () => {
      cancelled = true
      unsubsRef.current.forEach((unsub) => unsub())
      unsubsRef.current = []
    }
  }, [user])

  // Trade listener rebuilt when activeSeason changes (AppState.activeSeason didSet)
  useEffect(() => {
    if (DEV_PREVIEW || !user) return
    const unsub = fs.listenToTrades(activeSeason, setTrades)
    return unsub
  }, [user, activeSeason])

  // ── Computed (AppState computed properties) ─────────────────
  // Roster/cap views count only salary-status 'rostered' players (missing
  // field = rostered, so no data migration needed). Dropped/cleared players
  // stay visible through `droppedPlayers` below.
  const allDisplayAssets = useMemo(
    () => [
      ...players
        .filter((p) => (p.salaryStatus ?? 'rostered') === 'rostered')
        .map((p) => playerToDisplayAsset(p, activeSeason)),
      ...draftPicks.map((p) => pickToDisplayAsset(p, activeSeason)),
    ],
    [players, draftPicks, activeSeason],
  )

  /** Players off a roster with the 2-auction clock running (or done). */
  const droppedPlayers = useMemo(
    () =>
      players
        .filter((p) => (p.salaryStatus ?? 'rostered') !== 'rostered')
        .map((p) => ({ ...playerToDisplayAsset(p, activeSeason), salaryStatus: p.salaryStatus, auctionsCleared: p.auctionsCleared ?? 0 })),
    [players, activeSeason],
  )

  const matches = useMemo(
    () => findMatches(allLeagueFMK, allDisplayAssets, userTeam || null),
    [allLeagueFMK, allDisplayAssets, userTeam],
  )

  const myMatchCount = useMemo(
    () => matches.filter((m) => m.teamA === userTeam || m.teamB === userTeam).length,
    [matches, userTeam],
  )

  // Offers sitting in MY inbox — ESPN-style "action needed" signal
  const incomingOffers = useMemo(
    () => trades.filter((t) => t.status === 'proposed' && t.receivingTeamName === userTeam),
    [trades, userTeam],
  )
  const incomingTradeCount = incomingOffers.length

  // ── Actions (AppState methods) ──────────────────────────────
  const currentFMKSignal = useCallback(
    (assetId) => fmkSignals.find((s) => s.assetId === assetId)?.signal ?? null,
    [fmkSignals],
  )

  const uid = user?.uid ?? (DEV_PREVIEW ? 'preview-user' : null)

  const setFMKSignal = useCallback(
    async (asset, signal) => {
      if (!uid) return
      const record = {
        userId: uid,
        teamName: userTeam,
        assetId: asset.assetId,
        assetName: asset.name,
        assetOwnerTeam: asset.teamName,
        signal,
      }
      // optimistic local update, matching iOS behavior
      setFmkSignals((prev) => [
        ...prev.filter((s) => s.assetId !== asset.assetId),
        { ...record, id: `_` },
      ])
      if (!DEV_PREVIEW) await fs.setFMKSignal(record)
    },
    [uid, userTeam],
  )

  const removeFMKSignal = useCallback(
    async (assetId) => {
      if (!uid) return
      setFmkSignals((prev) => prev.filter((s) => s.assetId !== assetId))
      if (!DEV_PREVIEW) await fs.removeFMKSignal(uid, assetId)
    },
    [uid],
  )

  const toggleInterest = useCallback(
    async (asset) => {
      if (!uid) return
      const has = interestedAssetIds.has(asset.assetId)
      setInterestedAssetIds((prev) => {
        const next = new Set(prev)
        has ? next.delete(asset.assetId) : next.add(asset.assetId)
        return next
      })
      if (DEV_PREVIEW) return
      if (has) await fs.removePlayerInterest(asset.assetId, uid)
      else await fs.addPlayerInterest({ userId: uid, assetId: asset.assetId, teamName: userTeam })
    },
    [uid, userTeam, interestedAssetIds],
  )

  const loadAllLeagueInterests = useCallback(() => {
    if (DEV_PREVIEW) return
    fs.fetchAllInterests().then(setAllLeagueInterests).catch(() => {})
  }, [])

  const loadLeagueHistory = useCallback(() => {
    if (DEV_PREVIEW) return
    fs.fetchLeagueHistory().then(setLeagueHistory).catch(() => {})
  }, [])

  const saveUserSettings = useCallback(
    async (settings) => {
      if (!uid) return
      setUserSettings(settings)
      if (!DEV_PREVIEW) await fs.saveUserSettings(settings, uid)
    },
    [uid],
  )

  const proposeTradeFor = useCallback((asset) => {
    setSelectedAssetForTrade(asset)
    setTriggerTradeProposal(true)
  }, [])

  // ── Rules actions ───────────────────────────────────────────
  const proposeRule = useCallback(
    async ({ title, category = 'Operations', summary = '', changes = [] }) => {
      const rule = { title, category, summary, changes, proposedBy: userTeam, season: activeSeason }
      if (DEV_PREVIEW) {
        setRules((prev) => [
          { ...rule, id: `preview-rule-${prev.length}`, status: 'proposed', votes: {}, proposedAt: new Date() },
          ...prev,
        ])
        return
      }
      await fs.proposeRule(rule)
    },
    [userTeam, activeSeason],
  )

  const voteOnRule = useCallback(
    async (ruleId, vote) => {
      if (!userTeam) return
      if (DEV_PREVIEW) {
        setRules((prev) =>
          prev.map((r) => (r.id === ruleId ? { ...r, votes: { ...r.votes, [userTeam]: vote } } : r)),
        )
        return
      }
      await fs.voteOnRule(ruleId, userTeam, vote)
    },
    [userTeam],
  )

  const setVotingOpen = useCallback(async (open) => {
    setRulesVotingOpen(open) // optimistic
    if (DEV_PREVIEW) return
    await fs.setRulesVotingOpen(open).catch(() => setRulesVotingOpen(!open))
  }, [])

  /** Commissioner: close the portal and tally — ≥7 yes of 12 passes. */
  /**
   * Close voting and apply the full §Voting Structure tally: 7+ votes to be
   * eligible, only one rule per limited category (Scoring/Starters/Money),
   * Operations unlimited, ties flagged for the Rules Committee. Written as
   * one atomic batch so a failure can't leave rules half-decided.
   */
  const finalizeRuleVotes = useCallback(async () => {
    const { tallyVotes, banStatus } = await import('../services/ruleVoting')
    // Banned proposals (two consecutive rejections) sit out — tallying them
    // would record a fresh rejection and wrongly extend the ban.
    const proposed = rules.filter(
      (r) => r.status === 'proposed' && !banStatus(r, activeSeason).banned,
    )
    const { results } = tallyVotes(proposed)

    if (DEV_PREVIEW) {
      setRules((prev) =>
        prev.map((r) => {
          const res = results.find((x) => x.id === r.id)
          return res
            ? {
                ...r,
                status: res.status,
                decidedSeason: activeSeason,
                voteReason: res.reason,
                rejectionYears:
                  res.status === 'failed'
                    ? [...new Set([...(r.rejectionYears ?? []), activeSeason])]
                    : r.rejectionYears,
              }
            : r
        }),
      )
      setRulesVotingOpen(false)
      return results
    }

    await fs.applyVoteResults(results, activeSeason)
    setRulesVotingOpen(false)
    return results
  }, [rules, activeSeason])

  const proposeTrade = useCallback(
    async (trade) => {
      if (DEV_PREVIEW) {
        // simulate: append locally so the flow can be tested end-to-end
        setTrades((prev) => [
          { ...trade, id: `preview-${prev.length}`, status: 'proposed', date: new Date() },
          ...prev,
        ])
        return
      }
      await fs.proposeTrade(trade)
    },
    [],
  )

  const respondToTrade = useCallback(async (tradeId, response) => {
    if (DEV_PREVIEW) {
      setTrades((prev) =>
        prev.map((t) =>
          t.id === tradeId ? { ...t, response, status: response === 'yes' ? 'accepted' : 'rejected' } : t,
        ),
      )
      return
    }
    await fs.respondToTrade(tradeId, response)
  }, [])

  /** Counter an offer: original → 'countered', new swapped offer linked via parentTradeId. */
  const counterTrade = useCallback(async (originalTradeId, newTrade) => {
    if (DEV_PREVIEW) {
      setTrades((prev) => [
        {
          ...newTrade,
          id: `preview-counter-${prev.length}`,
          status: 'proposed',
          parentTradeId: originalTradeId,
          date: new Date(),
        },
        ...prev.map((t) => (t.id === originalTradeId ? { ...t, status: 'countered' } : t)),
      ])
      return
    }
    await fs.counterTrade(originalTradeId, newTrade)
  }, [])

  const value = {
    // auth
    user, authReady, isAdmin, isCommissioner,
    // league data
    userTeam, setUserTeam,
    selectedTeam, setSelectedTeam,
    activeSeason, setActiveSeason,
    isOffSeason, setIsOffSeason,
    isInitialLoadComplete,
    players, draftPicks, trades, messages,
    allDisplayAssets, droppedPlayers, matches, myMatchCount,
    // FMK + interests
    fmkSignals, allLeagueFMK, currentFMKSignal, setFMKSignal, removeFMKSignal,
    interestedAssetIds, toggleInterest,
    allLeagueInterests, loadAllLeagueInterests,
    // settings + history
    userSettings, didLoadSettings, saveUserSettings,
    leagueHistory, loadLeagueHistory,
    // rules + voting
    rules, rulesVotingOpen, proposeRule, voteOnRule, setVotingOpen, finalizeRuleVotes,
    // transaction ledger
    transactions,
    // trade proposal trigger + trade actions
    selectedAssetForTrade, setSelectedAssetForTrade,
    triggerTradeProposal, setTriggerTradeProposal, proposeTradeFor,
    proposeTrade, respondToTrade, counterTrade,
    incomingOffers, incomingTradeCount,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>')
  return ctx
}
