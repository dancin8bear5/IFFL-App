// AppContext — web port of AppState (App/CodeRedApp.swift).
// Holds auth state + all league data. On login it mirrors AppState.setup(for:):
// fetch config/league, resolve the user's team, attach the five snapshot
// listeners, and load the user's interests, FMK signals, and settings.
import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { listenToAuth } from '../services/authService'
import { FMK_ENABLED, fantasyTeams } from '../data/staticData'
import { parseRoute, teamFromSlug } from '../services/routing'
import * as fs from '../services/firestoreService'
import { canVote } from '../services/tradeVotes'
import { playerToDisplayAsset, pickToDisplayAsset } from '../services/models'
import { withOwnedRanks } from '../services/ownedRank'
import { findMatches } from '../services/marketEngine'

export const AppContext = createContext(null)

// Dev-only preview mode (?preview=1 under `npm run dev`): fills the context
// with sample data so screens can be tested without signing in. Dead code in
// production builds — import.meta.env.DEV is compile-time false there.
const DEV_PREVIEW =
  import.meta.env.DEV && new URLSearchParams(window.location.search).has('preview')
// Preview defaults to off-season (that's the league's normal state most of
// the year). `&inseason=1` flips it so the in-season-only surfaces — the
// scoring charts, the milestone strip — can actually be looked at.
const DEV_INSEASON =
  DEV_PREVIEW && new URLSearchParams(window.location.search).has('inseason')

const DEFAULT_SETTINGS = {
  teamLogoName: null,
  displayNickname: null,
  defaultTab: 0,
  showTradeValues: true,
  fmkPublic: true,
  retroMode: false,
  uiTheme: 'default',
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
  // A roster deep link names the team to show, and it has to outrank the
  // "your own team" default applied once league data loads — otherwise
  // opening #rosters/a-zurek lands on your roster instead of theirs.
  // Read once, at module init, before any of that runs.
  const deepLinkedTeam = (() => {
    if (typeof window === 'undefined') return ''
    const { slug, param } = parseRoute(window.location.hash)
    return slug === 'rosters' ? teamFromSlug(param, fantasyTeams) : ''
  })()
  const [selectedTeam, setSelectedTeam] = useState(deepLinkedTeam)
  const [isCommissioner, setIsCommissioner] = useState(false)
  const [activeSeason, setActiveSeason] = useState(2026)
  const [isOffSeason, setIsOffSeason] = useState(false)
  const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false)
  const [players, setPlayers] = useState([])
  const [draftPicks, setDraftPicks] = useState([])
  const [trades, setTrades] = useState([])
  const [tradeVotes, setTradeVotes] = useState([])
  const [messages, setMessages] = useState([])
  const [teamAvatars, setTeamAvatars] = useState({})
  const [interestedAssetIds, setInterestedAssetIds] = useState(new Set())
  const [allLeagueInterests, setAllLeagueInterests] = useState([])
  const [fmkSignals, setFmkSignals] = useState([])
  const [allLeagueFMK, setAllLeagueFMK] = useState([])
  const [userSettings, setUserSettings] = useState(DEFAULT_SETTINGS)
  const [didLoadSettings, setDidLoadSettings] = useState(false)
  const [leagueHistory, setLeagueHistory] = useState([])
  const [historyMatchups, setHistoryMatchups] = useState([]) // historyMatchups/{year} docs, lazy
  const [historyAggregates, setHistoryAggregates] = useState(null) // {scoring, draft}, lazy
  const [leagueRecords, setLeagueRecords] = useState([])
  const [rules, setRules] = useState([])
  const [rulesVotingOpen, setRulesVotingOpen] = useState(false)
  const [transactions, setTransactions] = useState([])
  const [weeklyScores, setWeeklyScores] = useState({})   // { "1": [{teamName, points}], ... }
  const [weeklyRecords, setWeeklyRecords] = useState({}) // { [teamName]: {wins, losses, ties} }
  const [playoffs, setPlayoffs] = useState(null)
  const [parlayConfig, setParlayConfig] = useState(null)
  const [parlayEntries, setParlayEntries] = useState([])
  // Commissioner kill-switches: area keys hidden from the whole league
  const [disabledAreas, setDisabledAreas] = useState(new Set())
  const [rolloverArmed, setRolloverArmed] = useState(false)
  // Off unless the config says otherwise — the Big Board stays out of
  // the nav by default and is reached by its #board URL.
  const [bigBoardInNav, setBigBoardInNav] = useState(false)
  const [liveScoresMode, setLiveScoresMode] = useState('off')

  // Trade-proposal cross-tab trigger (AssetDetail → Market)
  const [selectedAssetForTrade, setSelectedAssetForTrade] = useState(null)
  const [triggerTradeProposal, setTriggerTradeProposal] = useState(false)

  const unsubsRef = useRef([])

  // Admin gate — Jared only, but he has two Google accounts. Also honors
  // authorizedUIDs from config (the same list firestore.rules trusts).
  // (Preview mode: enabled for UI testing.)
  const ADMIN_EMAILS = ['jaredrogtaylor@gmail.com', 'jarrtayl@gmail.com']
  const isAdmin = DEV_PREVIEW || ADMIN_EMAILS.includes(user?.email) || isCommissioner

  // POD tab gate — the three guys who actually do the show. Keyed on team
  // name (resolved from the verified-email auto-link) rather than a second
  // hardcoded email list, so a member changing Google accounts doesn't
  // silently lose access. Jared is always in via the admin gate.
  const POD_TEAMS = ['Jared', 'M. Zurek', 'Bill']
  const isPodMember = isAdmin || POD_TEAMS.includes(userTeam)

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
  }, [userSettings.retroMode, userSettings.uiTheme, userSettings.accentColor, userSettings.textSize, userTeam])

  // Dev preview: load sample data once instead of Firestore
  useEffect(() => {
    if (!DEV_PREVIEW) return
    import('../data/previewData').then((d) => {
      setUserTeam('Jared')
      if (!deepLinkedTeam) setSelectedTeam('Jared')
      setIsOffSeason(!DEV_INSEASON)
      setPlayers(d.previewPlayers)
      setDraftPicks(d.previewPicks)
      setTrades(d.previewTrades)
      setTradeVotes(d.previewTradeVotes ?? [])
      setMessages(d.previewMessages)
      setAllLeagueFMK(d.previewFMK)
      setLeagueHistory(d.previewHistory)
      setHistoryMatchups(d.previewHistoryMatchups ?? [])
      setHistoryAggregates(d.previewHistoryAggregates ? { ...d.previewHistoryAggregates, lineups: d.previewHistoryLineups ?? null } : null)
      setRules(d.previewRules ?? [])
      setTransactions(d.previewTransactions ?? [])
      setParlayConfig(d.previewParlayConfig ?? null)
      setParlayEntries(d.previewParlayEntries ?? [])
      setLeagueRecords(d.previewRecords ?? [])
      setWeeklyScores(d.previewWeeklyScores ?? {})
      setWeeklyRecords(d.previewTeamRecords ?? {})
      setPlayoffs(d.previewPlayoffs ?? null)
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
          setDisabledAreas(new Set(config.disabledAreas ?? []))
          setRolloverArmed(config.rolloverArmed ?? false)
          setBigBoardInNav(config.bigBoardInNav ?? false)
          setLiveScoresMode(config.liveScores ?? 'off')
          setIsCommissioner((config.authorizedUIDs ?? []).includes(uid))
          const team = config.userTeamMap?.[uid]
          if (team) {
            setUserTeam(team)
            if (!deepLinkedTeam) setSelectedTeam(team)
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
                if (!deepLinkedTeam) setSelectedTeam(claimed)
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
        fs.listenToTeamAvatars(setTeamAvatars),
        // FMK_ENABLED is off, so this whole-collection subscription would be
        // paying for data nothing renders. Every consumer of allLeagueFMK is
        // behind the flag and degrades to zero/empty, so it stays unsubscribed
        // until the feature comes back.
        ...(FMK_ENABLED ? [fs.listenToAllFMKSignals(setAllLeagueFMK)] : []),
        fs.listenToRules(setRules),
        fs.listenToTransactions(setTransactions),
        fs.listenToParlayConfig(setParlayConfig),
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

  // BOOM/DOOM verdicts, season-scoped like the trades they belong to.
  useEffect(() => {
    if (DEV_PREVIEW || !user) return
    return fs.listenToTradeVotes(activeSeason, setTradeVotes)
  }, [user, activeSeason])

  // Weekly scores follow activeSeason. League-readable (weeklyScores/),
  // so this powers the in-season Dashboard charts for everyone — not
  // just the three POD hosts.
  useEffect(() => {
    if (DEV_PREVIEW || !user) return
    return fs.listenToWeeklyScores(activeSeason, ({ weeks, records }) => {
      setWeeklyScores(weeks)
      setWeeklyRecords(records)
    })
  }, [user, activeSeason])

  // Playoff bracket for the active season
  useEffect(() => {
    if (DEV_PREVIEW || !user) return
    return fs.listenToPlayoffs(activeSeason, setPlayoffs)
  }, [user, activeSeason])

  // Parlay entries follow the commissioner's active week
  useEffect(() => {
    if (DEV_PREVIEW || !user || !parlayConfig?.season || !parlayConfig?.week) return
    return fs.listenToParlayEntries(parlayConfig.season, parlayConfig.week, setParlayEntries)
  }, [user, parlayConfig?.season, parlayConfig?.week])

  const submitParlayPick = useCallback(
    async (asset) => {
      if (!userTeam || !parlayConfig) return
      const entry = {
        season: parlayConfig.season,
        week: parlayConfig.week,
        teamName: userTeam,
        playerId: asset.id,
        playerName: asset.name,
        userId: user?.uid ?? null,
      }
      if (DEV_PREVIEW) {
        setParlayEntries((prev) => [
          ...prev.filter((e) => e.teamName !== userTeam),
          { ...entry, id: `preview-parlay-${userTeam}`, submittedAt: new Date() },
        ])
        return
      }
      await fs.submitParlayEntry(entry)
    },
    [userTeam, parlayConfig, user],
  )

  /** Is an app area visible to the league? Admin always sees everything. */
  const toggleBigBoardInNav = useCallback(async () => {
    const next = !bigBoardInNav
    setBigBoardInNav(next)
    await fs.setBigBoardInNav(next).catch(() => setBigBoardInNav(!next))
  }, [bigBoardInNav])

  const areaEnabled = useCallback(
    (key) => isAdmin || !disabledAreas.has(key),
    [disabledAreas, isAdmin],
  )

  /** Commissioner: flip an area on/off league-wide (optimistic). */
  const toggleArea = useCallback(
    async (key) => {
      const next = new Set(disabledAreas)
      next.has(key) ? next.delete(key) : next.add(key)
      setDisabledAreas(next)
      if (DEV_PREVIEW) return
      await fs.setDisabledAreas([...next]).catch(() => setDisabledAreas(disabledAreas))
    },
    [disabledAreas],
  )

  /** Commissioner: arm/disarm the season rollover safety switch (optimistic). */
  const armRollover = useCallback(
    async (armed) => {
      const prev = rolloverArmed
      setRolloverArmed(armed)
      if (DEV_PREVIEW) return
      await fs.setRolloverArmed(armed).catch(() => setRolloverArmed(prev))
    },
    [rolloverArmed],
  )

  // ── Computed (AppState computed properties) ─────────────────
  // Roster/cap views count only salary-status 'rostered' players (missing
  // field = rostered, so no data migration needed). Dropped/cleared players
  // stay visible through `droppedPlayers` below.
  const allDisplayAssets = useMemo(
    () => withOwnedRanks([
      ...players
        .filter((p) => (p.salaryStatus ?? 'rostered') === 'rostered')
        .map((p) => playerToDisplayAsset(p, activeSeason)),
      ...draftPicks.map((p) => pickToDisplayAsset(p, activeSeason)),
    ]),
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

  /**
   * Cast a permanent BOOM/DOOM verdict. Rejection from Firestore means the
   * vote already existed or the caller was in the trade — both are final,
   * so surface the failure instead of retrying.
   */
  const castTradeVote = useCallback(
    async (trade, votedFor) => {
      if (!uid || !canVote(trade, userTeam)) return false
      if (DEV_PREVIEW) {
        // Preview has no auth, so the real write would just 401. Keep the
        // flow demoable locally — and still one-shot, like the real thing.
        setTradeVotes((prev) =>
          prev.some((v) => v.tradeId === trade.id && v.uid === uid)
            ? prev
            : [...prev, { id: `${trade.id}_${uid}`, tradeId: trade.id, uid, votedFor, season: activeSeason, voterTeam: userTeam }],
        )
        return true
      }
      await fs.castTradeVote({
        tradeId: trade.id, uid, votedFor, season: activeSeason, voterTeam: userTeam,
      })
      return true
    },
    [uid, userTeam, activeSeason],
  )

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

  // Full ESPN game history (2008–2025) — ~450KB across 18 docs, so it loads
  // once, lazily, when the Trophy Room first opens, and is kept for the session.
  const loadHistoryMatchups = useCallback(() => {
    if (DEV_PREVIEW) return
    setHistoryMatchups((prev) => {
      if (prev.length === 0) fs.fetchHistoryMatchups().then(setHistoryMatchups).catch(() => {})
      return prev
    })
  }, [])

  // Precomputed scoring/draft chart feeds — two small docs, same lazy pattern.
  const loadHistoryAggregates = useCallback(() => {
    if (DEV_PREVIEW) return
    setHistoryAggregates((prev) => {
      if (prev === null) fs.fetchHistoryAggregates().then(setHistoryAggregates).catch(() => {})
      return prev
    })
  }, [])

  const loadLeagueRecords = useCallback(() => {
    if (DEV_PREVIEW) return
    fs.fetchLeagueRecords().then(setLeagueRecords).catch(() => {})
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

  // ── Profile picture ─────────────────────────────────────────
  // Writes to the caller's OWN team only; the rules enforce the same thing
  // server-side. Everything renders through TeamAvatar, so a save here
  // shows up everywhere at once via the teamAvatars listener.
  const saveMyAvatarImage = useCallback(async (dataUrl) => {
    if (!userTeam) throw new Error('No team assigned yet.')
    if (DEV_PREVIEW) { setTeamAvatars((p) => ({ ...p, [userTeam]: { dataUrl } })); return }
    await fs.saveTeamAvatarImage(userTeam, dataUrl, user?.uid)
  }, [userTeam, user])

  const saveMyAvatarPreset = useCallback(async (presetId) => {
    if (!userTeam) throw new Error('No team assigned yet.')
    if (DEV_PREVIEW) { setTeamAvatars((p) => ({ ...p, [userTeam]: { presetId } })); return }
    await fs.saveTeamAvatarPreset(userTeam, presetId, user?.uid)
  }, [userTeam, user])

  const clearMyAvatar = useCallback(async () => {
    if (!userTeam) return
    if (DEV_PREVIEW) {
      setTeamAvatars((p) => { const n = { ...p }; delete n[userTeam]; return n })
      return
    }
    await fs.clearTeamAvatar(userTeam)
  }, [userTeam])

  const value = {
    // auth
    user, authReady, isAdmin, isCommissioner, isPodMember,
    // profile pictures — keyed by team name, read by everyone
    teamAvatars, saveMyAvatarImage, saveMyAvatarPreset, clearMyAvatar,
    // league data
    userTeam, setUserTeam,
    selectedTeam, setSelectedTeam,
    activeSeason, setActiveSeason,
    isOffSeason, setIsOffSeason,
    isInitialLoadComplete,
    players, draftPicks, trades, messages,
    tradeVotes, castTradeVote, uid,
    isPreview: DEV_PREVIEW,
    liveScoresMode, setLiveScoresMode,
    allDisplayAssets, droppedPlayers, matches, myMatchCount,
    // FMK + interests
    fmkSignals, allLeagueFMK, currentFMKSignal, setFMKSignal, removeFMKSignal,
    interestedAssetIds, toggleInterest,
    allLeagueInterests, loadAllLeagueInterests,
    // settings + history
    userSettings, didLoadSettings, saveUserSettings,
    leagueHistory, loadLeagueHistory,
    historyMatchups, loadHistoryMatchups,
    historyAggregates, loadHistoryAggregates,
    leagueRecords, loadLeagueRecords, setLeagueRecords,
    // rules + voting
    rules, rulesVotingOpen, proposeRule, voteOnRule, setVotingOpen, finalizeRuleVotes,
    // transaction ledger
    transactions,
    // weekly scores (league-readable; POD analysis stays in the POD tab)
    weeklyScores, weeklyRecords, playoffs,
    // low points parlay
    parlayConfig, parlayEntries, submitParlayPick,
    // area kill-switches
    disabledAreas, areaEnabled, toggleArea,
    bigBoardInNav, toggleBigBoardInNav,
    rolloverArmed, armRollover,
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
