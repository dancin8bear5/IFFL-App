import Foundation
import Supabase

/// Data fetching for owners + teams + contracts. PostgREST queries via
/// supabase-swift; RLS policies handle access. Reads are unauthenticated-safe
/// in the schema (everyone can read everything in their league).
@MainActor
@Observable
public final class LeagueRepository {
    public static let shared = LeagueRepository()

    private let client = SupabaseService.shared.client

    // MARK: Owners + Teams (joined)

    /// Bundle of every team in a season with its owner and current contract list.
    /// Lets us render the roster list with cap usage in a single round-trip.
    public struct TeamWithRoster: Identifiable, Hashable, Sendable, Codable {
        public let id: UUID                    // team.id
        public let ownerId: UUID
        public let season: Int
        public let espnTeamName: String
        public let teamAvatarUrl: String?
        public let owner: Owner
        public let contracts: [Contract]

        /// Sum of non-waiver contracts — the cap denominator.
        public var capSalary: Decimal {
            contracts
                .filter { !$0.isDropped && !$0.isWaiverBaseline }
                .reduce(Decimal(0)) { $0 + $1.currentKeeperCost }
        }

        public var rosterCount: Int {
            contracts.filter { !$0.isDropped }.count
        }

        enum CodingKeys: String, CodingKey {
            case id
            case ownerId = "owner_id"
            case season
            case espnTeamName = "espn_team_name"
            case teamAvatarUrl = "team_avatar_url"
            case owner = "app_users"   // PostgREST embeds via FK alias
            case contracts
        }
    }

    public func fetchTeamsWithRosters(season: Int = 2026) async throws -> [TeamWithRoster] {
        let response: [TeamWithRoster] = try await client
            .from("teams")
            .select("""
                id, owner_id, season, espn_team_name, team_avatar_url,
                app_users:owner_id ( id, master_name, full_name, email, phone, groupme_handle,
                                     is_commissioner, is_treasurer, is_rules_committee ),
                contracts ( id, team_id, player_id, season, source, original_cost,
                            acquired_in_season, years_kept, current_keeper_cost,
                            rookie_round, rookie_year, is_on_ir, is_dropped,
                            dropped_at, faab_clears_after_drop, trade_history_text )
                """)
            .eq("season", value: season)
            .execute()
            .value

        return response.sorted { $0.owner.fullName < $1.owner.fullName }
    }

    // MARK: Single-team fetch with player details for the contract list

    public struct ContractWithPlayer: Identifiable, Hashable, Sendable, Codable {
        public let id: UUID
        public let teamId: UUID
        public let playerId: UUID
        public let season: Int
        public let source: Contract.Source
        public let originalCost: Decimal
        public let acquiredInSeason: Int
        public let yearsKept: Int
        public let currentKeeperCost: Decimal
        public let rookieRound: Int?
        public let rookieYear: Int?
        public let isOnIR: Bool
        public let isDropped: Bool
        public let tradeHistoryText: String?
        public let player: Player

        public var nextSeasonCost: Decimal? {
            guard yearsKept < 5 else { return nil }
            return try? KeeperCostCalculator.cost(
                original: originalCost, yearsKept: yearsKept + 1
            )
        }

        public var isWaiverBaseline: Bool {
            source == .faab && originalCost == 2 && yearsKept == 0
        }

        enum CodingKeys: String, CodingKey {
            case id
            case teamId = "team_id"
            case playerId = "player_id"
            case season, source
            case originalCost = "original_cost"
            case acquiredInSeason = "acquired_in_season"
            case yearsKept = "years_kept"
            case currentKeeperCost = "current_keeper_cost"
            case rookieRound = "rookie_round"
            case rookieYear = "rookie_year"
            case isOnIR = "is_on_ir"
            case isDropped = "is_dropped"
            case tradeHistoryText = "trade_history_text"
            case player = "players"
        }
    }

    public func fetchContracts(teamId: UUID, season: Int = 2026)
    async throws -> [ContractWithPlayer] {
        let response: [ContractWithPlayer] = try await client
            .from("contracts")
            .select("""
                id, team_id, player_id, season, source, original_cost,
                acquired_in_season, years_kept, current_keeper_cost,
                rookie_round, rookie_year, is_on_ir, is_dropped, trade_history_text,
                players ( id, espn_id, full_name, position, nfl_team )
                """)
            .eq("team_id", value: teamId.uuidString)
            .eq("season", value: season)
            .eq("is_dropped", value: false)
            .execute()
            .value

        return response.sorted {
            // Highest cap first within position groupings
            if $0.player.position != $1.player.position {
                return positionOrder($0.player.position) < positionOrder($1.player.position)
            }
            return $0.currentKeeperCost > $1.currentKeeperCost
        }
    }

    private func positionOrder(_ p: Player.Position) -> Int {
        switch p {
        case .qb: 0
        case .rb: 1
        case .wr: 2
        case .te: 3
        case .op: 4
        case .k:  5
        case .dst: 6
        }
    }

    // MARK: Calendar

    public func fetchCalendar(season: Int = 2026) async throws -> [CalendarMilestone] {
        let response: [CalendarMilestone] = try await client
            .from("league_calendar")
            .select()
            .eq("season", value: season)
            .order("due_at", ascending: true)
            .execute()
            .value
        return response
    }

    public func fetchRookiePicks(ownerTeamId: UUID) async throws -> [RookiePick] {
        let response: [RookiePick] = try await client
            .from("rookie_picks")
            .select("id, pick_year, round, slot, owner_team_id")
            .eq("owner_team_id", value: ownerTeamId.uuidString)
            .order("pick_year", ascending: true)
            .order("round", ascending: true)
            .order("slot", ascending: true)
            .execute()
            .value
        return response
    }

    // MARK: Trades

    /// Persist a freshly built trade proposal. Inserts the parent `trades` row,
    /// then bulk-inserts all `trade_assets` children. Returns the new trade id.
    func proposeTrade(_ draft: TradeProposalDraft) async throws -> UUID {
        guard let theirTeam = draft.theirTeam else {
            throw NSError(domain: "iffl", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "No counterparty selected."])
        }
        struct NewTrade: Encodable {
            let proposed_by: String
            let proposed_to: String
            let status: String
            let source_channel: String
            let notes: String?
        }
        let newTrade = NewTrade(
            proposed_by: draft.myTeam.id.uuidString,
            proposed_to: theirTeam.id.uuidString,
            status: Trade.Status.proposed.rawValue,
            source_channel: Trade.SourceChannel.iosApp.rawValue,
            notes: draft.notes.isEmpty ? nil : draft.notes
        )
        struct InsertedTrade: Decodable { let id: UUID }
        let inserted: [InsertedTrade] = try await client
            .from("trades")
            .insert(newTrade)
            .select("id")
            .execute()
            .value
        guard let tradeId = inserted.first?.id else {
            throw NSError(domain: "iffl", code: 2,
                          userInfo: [NSLocalizedDescriptionKey: "Failed to create trade."])
        }

        struct NewAsset: Encodable {
            let trade_id: String
            let giving_team_id: String
            let asset_type: String
            let contract_id: String?
            let rookie_pick_id: String?
            let faab_amount: Decimal?
        }

        var rows: [NewAsset] = []
        for cid in draft.myContractsGiving {
            rows.append(NewAsset(
                trade_id: tradeId.uuidString,
                giving_team_id: draft.myTeam.id.uuidString,
                asset_type: TradeAsset.Kind.contract.rawValue,
                contract_id: cid.uuidString,
                rookie_pick_id: nil,
                faab_amount: nil
            ))
        }
        for cid in draft.theirContractsGiving {
            rows.append(NewAsset(
                trade_id: tradeId.uuidString,
                giving_team_id: theirTeam.id.uuidString,
                asset_type: TradeAsset.Kind.contract.rawValue,
                contract_id: cid.uuidString,
                rookie_pick_id: nil,
                faab_amount: nil
            ))
        }
        for pid in draft.myPicksGiving {
            rows.append(NewAsset(
                trade_id: tradeId.uuidString,
                giving_team_id: draft.myTeam.id.uuidString,
                asset_type: TradeAsset.Kind.rookiePick.rawValue,
                contract_id: nil,
                rookie_pick_id: pid.uuidString,
                faab_amount: nil
            ))
        }
        for pid in draft.theirPicksGiving {
            rows.append(NewAsset(
                trade_id: tradeId.uuidString,
                giving_team_id: theirTeam.id.uuidString,
                asset_type: TradeAsset.Kind.rookiePick.rawValue,
                contract_id: nil,
                rookie_pick_id: pid.uuidString,
                faab_amount: nil
            ))
        }
        if draft.myFAABGiving > 0 {
            rows.append(NewAsset(
                trade_id: tradeId.uuidString,
                giving_team_id: draft.myTeam.id.uuidString,
                asset_type: TradeAsset.Kind.faabDollars.rawValue,
                contract_id: nil,
                rookie_pick_id: nil,
                faab_amount: draft.myFAABGiving
            ))
        }
        if draft.theirFAABGiving > 0 {
            rows.append(NewAsset(
                trade_id: tradeId.uuidString,
                giving_team_id: theirTeam.id.uuidString,
                asset_type: TradeAsset.Kind.faabDollars.rawValue,
                contract_id: nil,
                rookie_pick_id: nil,
                faab_amount: draft.theirFAABGiving
            ))
        }

        if !rows.isEmpty {
            try await client.from("trade_assets").insert(rows).execute()
        }
        return tradeId
    }

    /// Trades I'm involved in (proposer or proposee), regardless of status.
    /// Joined with both teams + their owners.
    public struct TradeWithTeams: Identifiable, Hashable, Sendable, Codable {
        public let id: UUID
        public let proposedBy: UUID
        public let proposedTo: UUID
        public let status: Trade.Status
        public let proposedAt: Date
        public let decidedAt: Date?
        public let notes: String?
        public let proposingTeam: TeamLite
        public let receivingTeam: TeamLite

        public struct TeamLite: Hashable, Sendable, Codable {
            public let id: UUID
            public let espnTeamName: String
            public let owner: OwnerLite

            public struct OwnerLite: Hashable, Sendable, Codable {
                public let masterName: String
                public let fullName: String

                enum CodingKeys: String, CodingKey {
                    case masterName = "master_name"
                    case fullName = "full_name"
                }
            }

            enum CodingKeys: String, CodingKey {
                case id
                case espnTeamName = "espn_team_name"
                case owner = "app_users"
            }
        }

        enum CodingKeys: String, CodingKey {
            case id
            case proposedBy = "proposed_by"
            case proposedTo = "proposed_to"
            case status
            case proposedAt = "proposed_at"
            case decidedAt = "decided_at"
            case notes
            case proposingTeam = "proposing_team"
            case receivingTeam = "receiving_team"
        }
    }

    public func fetchTrades(forTeam teamId: UUID) async throws -> [TradeWithTeams] {
        let response: [TradeWithTeams] = try await client
            .from("trades")
            .select("""
                id, proposed_by, proposed_to, status, proposed_at, decided_at, notes,
                proposing_team:proposed_by ( id, espn_team_name, app_users:owner_id(master_name, full_name) ),
                receiving_team:proposed_to ( id, espn_team_name, app_users:owner_id(master_name, full_name) )
                """)
            .or("proposed_by.eq.\(teamId.uuidString),proposed_to.eq.\(teamId.uuidString)")
            .order("proposed_at", ascending: false)
            .execute()
            .value
        return response
    }

    public func updateTradeStatus(_ tradeId: UUID, to status: Trade.Status) async throws {
        struct StatusUpdate: Encodable { let status: String; let decided_at: Date? }
        try await client
            .from("trades")
            .update(StatusUpdate(status: status.rawValue, decided_at: Date()))
            .eq("id", value: tradeId.uuidString)
            .execute()
    }

    /// The next upcoming milestone (or nil if season is over).
    public func nextMilestone(season: Int = 2026) async throws -> CalendarMilestone? {
        let now = ISO8601DateFormatter().string(from: Date())
        let response: [CalendarMilestone] = try await client
            .from("league_calendar")
            .select()
            .eq("season", value: season)
            .gte("due_at", value: now)
            .order("due_at", ascending: true)
            .limit(1)
            .execute()
            .value
        return response.first
    }
}
