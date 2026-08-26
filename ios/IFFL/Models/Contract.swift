import Foundation

/// A player's contract on a team for a given season. The heart of keeper
/// management. Mirrors `contracts` in Postgres.
public struct Contract: Identifiable, Hashable, Sendable, Codable {
    public enum Source: String, Hashable, Sendable, Codable {
        case auction
        case rookieDraft = "rookie_draft"
        case faab
        case trade
        case keeper
        case freeAgent = "free_agent"
        case draftPick = "draft_pick"
    }

    public let id: UUID
    public let teamId: UUID
    public let playerId: UUID
    public let season: Int
    public let source: Source
    public let originalCost: Decimal
    public let acquiredInSeason: Int
    public let yearsKept: Int
    public let currentKeeperCost: Decimal
    public let rookieRound: Int?
    public let rookieYear: Int?
    public let isOnIR: Bool
    public let isDropped: Bool
    public let droppedAt: Date?
    public let faabClearsAfterDrop: Int
    public let tradeHistoryText: String?

    public init(
        id: UUID,
        teamId: UUID,
        playerId: UUID,
        season: Int,
        source: Source,
        originalCost: Decimal,
        acquiredInSeason: Int,
        yearsKept: Int,
        currentKeeperCost: Decimal,
        rookieRound: Int? = nil,
        rookieYear: Int? = nil,
        isOnIR: Bool = false,
        isDropped: Bool = false,
        droppedAt: Date? = nil,
        faabClearsAfterDrop: Int = 0,
        tradeHistoryText: String? = nil
    ) {
        self.id = id
        self.teamId = teamId
        self.playerId = playerId
        self.season = season
        self.source = source
        self.originalCost = originalCost
        self.acquiredInSeason = acquiredInSeason
        self.yearsKept = yearsKept
        self.currentKeeperCost = currentKeeperCost
        self.rookieRound = rookieRound
        self.rookieYear = rookieYear
        self.isOnIR = isOnIR
        self.isDropped = isDropped
        self.droppedAt = droppedAt
        self.faabClearsAfterDrop = faabClearsAfterDrop
        self.tradeHistoryText = tradeHistoryText
    }

    /// True when this contract entered via FAAB at the $2 baseline. Per IFFL
    /// rules, those don't count toward the $300 luxury tax cap.
    public var isWaiverBaseline: Bool {
        source == .faab && originalCost == 2 && yearsKept == 0
    }

    /// Cost forecast for the next N seasons assuming the contract is kept each year.
    public func forecast(seasons: Int) throws -> [Decimal] {
        try KeeperCostCalculator.forecast(
            original: originalCost,
            yearsKept: yearsKept,
            seasons: seasons
        )
    }

    enum CodingKeys: String, CodingKey {
        case id
        case teamId = "team_id"
        case playerId = "player_id"
        case season
        case source
        case originalCost = "original_cost"
        case acquiredInSeason = "acquired_in_season"
        case yearsKept = "years_kept"
        case currentKeeperCost = "current_keeper_cost"
        case rookieRound = "rookie_round"
        case rookieYear = "rookie_year"
        case isOnIR = "is_on_ir"
        case isDropped = "is_dropped"
        case droppedAt = "dropped_at"
        case faabClearsAfterDrop = "faab_clears_after_drop"
        case tradeHistoryText = "trade_history_text"
    }
}
