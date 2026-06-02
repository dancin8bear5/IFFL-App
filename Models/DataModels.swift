import Foundation
import FirebaseFirestore
import SwiftUI

// MARK: - Enums

enum TradeStatus: String, Codable {
    case proposed    = "proposed"
    case accepted    = "accepted"
    case rejected    = "rejected"
    case completed   = "completed"
    case historical  = "historical"
    case unknown     = "unknown"

    init(from decoder: Decoder) throws {
        let val = try decoder.singleValueContainer().decode(String.self)
        self = TradeStatus(rawValue: val) ?? .unknown
    }
}

enum TradeResponse: String, Codable {
    case yes   = "yes"
    case no    = "no"
    case maybe = "maybe"
}

// MARK: - FMK System

enum FMKSignal: String, Codable, CaseIterable {
    case fuck  = "fuck"
    case marry = "marry"
    case kill  = "kill"
}

struct PlayerFMK: Identifiable, Codable {
    @DocumentID var id: String?
    let userId: String
    let teamName: String
    let assetId: String
    let assetName: String
    let assetOwnerTeam: String
    var signal: FMKSignal
    var timestamp: Date
    var updatedAt: Date
}

enum PickStatus: String, Codable {
    case available = "available"
    case used      = "used"
}

enum AssetType: String, Codable {
    case player    = "player"
    case draftPick = "draftPick"
}

// MARK: - FantasyTeam (static UI config)

struct FantasyTeam {
    let name: String
    let color: Color
    let logo: String
    let beltWins: Int
}

let fantasyTeams: [FantasyTeam] = [
    // beltWins = league championships won (source: ESPN history 2009-2025)
    FantasyTeam(name: "A. Zurek", color: .red,    logo: "A. Zurek", beltWins: 0),
    FantasyTeam(name: "Abad",    color: .blue,   logo: "Abad",    beltWins: 1), // 2023
    FantasyTeam(name: "Bill",    color: .green,  logo: "Bill",    beltWins: 2), // 2024, 2025
    FantasyTeam(name: "Cantone", color: .purple, logo: "Cantone", beltWins: 1), // 2021
    FantasyTeam(name: "Dugan",   color: .orange, logo: "Dugan",   beltWins: 0),
    FantasyTeam(name: "Faybik",  color: .yellow, logo: "Faybik",  beltWins: 1), // 2017
    FantasyTeam(name: "Foley",   color: .pink,   logo: "Foley",   beltWins: 0),
    FantasyTeam(name: "Jared",   color: .cyan,   logo: "Jared",   beltWins: 3), // 2018, 2019, 2020
    FantasyTeam(name: "Jason",   color: .indigo, logo: "Jason",   beltWins: 0),
    FantasyTeam(name: "M. Zurek",color: .teal,   logo: "M. Zurek",beltWins: 1), // 2016
    FantasyTeam(name: "Ryan",    color: .mint,   logo: "Ryan",    beltWins: 2), // 2012, 2014
    FantasyTeam(name: "Wayne",   color: .brown,  logo: "Wayne",   beltWins: 1), // 2022
]

// MARK: - Player (Firestore: "players" collection)

struct Player: Identifiable, Codable, Hashable {
    @DocumentID var id: String?
    var teamName: String
    var position: String
    var name: String
    /// Salary cap prices keyed by season year string, e.g. ["2026": 25, "2027": 40, "2028": 60]
    var prices: [String: Int]
    var originalPrice: Int
    var purchaseYear: Int
    /// Number of contract years remaining from the current active season
    var contractYearsRemaining: Int
    /// "Auction", "Rookie Draft", "Free Agent", "Draft Pick"
    var playerPool: String
    /// Set if player was acquired through the rookie draft
    var rookieRound: Int?
    var rookieDraftYear: Int?
    /// Ordered list of trade notes, e.g. ["via Cantone", "via Ryan"]
    var tradeHistory: [String]
    var isActive: Bool
    /// Season year the player first appeared in the league
    var acquiredSeason: Int
    var nflTeam: String?

    var assetId: String { "\(teamName)-\(name)" }

    func currentPrice(season: Int) -> Int {
        prices[String(season)] ?? 0
    }

    func toDisplayAsset(activeSeason: Int) -> DisplayAsset {
        DisplayAsset(
            id: id ?? UUID().uuidString,
            teamName: teamName,
            position: position,
            name: name,
            currentPrice: prices[String(activeSeason)] ?? 0,
            prices: prices,
            originalPrice: originalPrice,
            purchaseYear: purchaseYear,
            contractYearsRemaining: contractYearsRemaining,
            playerPool: playerPool,
            rookieRound: rookieRound,
            rookieDraftYear: rookieDraftYear,
            tradeHistory: tradeHistory,
            assetType: .player,
            nflTeam: nflTeam
        )
    }

    static func == (lhs: Player, rhs: Player) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

// MARK: - DraftPickAsset (Firestore: "draftPicks" collection)

struct DraftPickAsset: Identifiable, Codable, Hashable {
    @DocumentID var id: String?
    /// Draft season year, e.g. 2026 or 2027
    var season: Int
    /// 1 or 2
    var round: Int
    /// Pick slot 1-12. nil for future-season picks without assigned slots
    var slot: Int?
    var currentTeamName: String
    /// Team that originally held the pick (for historical context)
    var originalTeamName: String
    /// Salary cap prices keyed by year, e.g. ["2026": 2, "2027": 7, "2028": 17]
    var prices: [String: Int]
    var tradeHistory: [String]
    var status: PickStatus
    /// Firestore player document ID once the pick is used
    var convertedPlayerId: String?
    /// Player name once the pick is used in the rookie draft
    var playerName: String?
    var nflTeam: String?

    var displayName: String {
        if let slot = slot {
            return "\(season) Round \(round) (Pick \(slot))"
        }
        return "\(season) Round \(round)"
    }

    func currentPrice(season: Int) -> Int {
        prices[String(season)] ?? 0
    }

    func toDisplayAsset(activeSeason: Int) -> DisplayAsset {
        DisplayAsset(
            id: id ?? UUID().uuidString,
            teamName: currentTeamName,
            position: "Draft Pick",
            name: displayName,
            currentPrice: prices[String(activeSeason)] ?? 0,
            prices: prices,
            originalPrice: prices[String(season)] ?? 0,
            purchaseYear: season,
            contractYearsRemaining: 1,
            playerPool: "Rookie Draft",
            rookieRound: round,
            rookieDraftYear: season,
            tradeHistory: tradeHistory,
            assetType: .draftPick,
            nflTeam: nil
        )
    }

    static func == (lhs: DraftPickAsset, rhs: DraftPickAsset) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

// MARK: - DisplayAsset (unified view model replacing PlayerOrPick)

struct DisplayAsset: Identifiable, Hashable {
    let id: String
    let teamName: String
    let position: String
    let name: String
    let currentPrice: Int
    let prices: [String: Int]
    let originalPrice: Int
    let purchaseYear: Int
    let contractYearsRemaining: Int
    let playerPool: String
    let rookieRound: Int?
    let rookieDraftYear: Int?
    let tradeHistory: [String]
    let assetType: AssetType
    let nflTeam: String?

    var isPick: Bool { assetType == .draftPick }
    var assetId: String { "\(teamName)-\(name)" }
    var formattedCurrentPrice: String { "$\(currentPrice)" }
    var formattedPurchaseYear: String { String(format: "%04d", purchaseYear) }

    /// Future price for the season after the given active season
    func price(forSeason year: Int) -> Int { prices[String(year)] ?? 0 }

    static func == (lhs: DisplayAsset, rhs: DisplayAsset) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

// MARK: - Trade (Firestore: "trades" collection — unified proposals + historical)

struct Trade: Identifiable, Codable {
    @DocumentID var id: String?
    var season: Int
    var date: Date
    var status: TradeStatus
    var proposingTeamName: String
    var receivingTeamName: String
    /// Assets the proposing team sends to the receiving team
    var assetsFromProposer: [TradeAssetRef]
    /// Assets the receiving team sends to the proposing team
    var assetsFromReceiver: [TradeAssetRef]
    var notes: String?
    var completedAt: Date?
    var response: TradeResponse?
    /// true for trades migrated from Google Sheets history
    var isHistorical: Bool
    /// Raw display names for historical trades (no Firestore IDs)
    var historicalProposerAssets: [String]?
    var historicalReceiverAssets: [String]?

    // MARK: Convenience display helpers

    var proposerAssetNames: [String] {
        if !assetsFromProposer.isEmpty { return assetsFromProposer.map { $0.displayName } }
        return historicalProposerAssets ?? []
    }

    var receiverAssetNames: [String] {
        if !assetsFromReceiver.isEmpty { return assetsFromReceiver.map { $0.displayName } }
        return historicalReceiverAssets ?? []
    }

    var formattedDate: String {
        let fmt = DateFormatter()
        fmt.dateFormat = "M/d/yy"
        return fmt.string(from: date)
    }
}

struct TradeAssetRef: Codable, Hashable {
    var assetType: AssetType
    /// Firestore document ID of the player or draft pick
    var assetId: String
    var displayName: String
    var teamName: String
}

// MARK: - PlayerInterest (Firestore: "playerInterests" collection)

struct PlayerInterest: Identifiable, Codable {
    @DocumentID var id: String?
    let userId: String
    let assetId: String
    let timestamp: Date
    var teamName: String?
}

// MARK: - Message (Firestore: "messages" collection)

struct Message: Identifiable, Codable {
    @DocumentID var id: String?
    let content: String
    let timestamp: Date
}

// MARK: - LeagueConfig (Firestore: "config/league")

struct LeagueConfig: Codable {
    var activeSeasonYear: Int
    var authorizedUIDs: [String]
    var userTeamMap: [String: String]
    var teamEmailMap: [String: String]
    var isOffSeason: Bool = false
}

// MARK: - UserSettings (Firestore: "userSettings/{userId}")

struct UserSettings: Codable {
    var teamLogoName: String?
    var displayNickname: String?
    var defaultTab: Int = 0
    var showTradeValues: Bool = true
    var fmkPublic: Bool = true
    var accentColorName: String?
}

// MARK: - League History (Firestore: "leagueHistory/{year}")

struct TeamFinish: Codable, Hashable {
    let teamName: String
    let place: Int
    let record: String?
    let pointsFor: Double?
}

struct SeasonHistory: Identifiable, Codable {
    @DocumentID var id: String?
    let season: Int
    let champion: String
    let runnerUp: String?
    let standings: [TeamFinish]
    let notableTrades: [String]?
}

// MARK: - Season (Firestore: "seasons/{year}")

struct Season: Identifiable, Codable {
    @DocumentID var id: String?
    var year: Int
    var isActive: Bool
    var milestones: [SeasonMilestone]
}

struct SeasonMilestone: Codable, Hashable {
    var name: String
    var description: String
    var date: Date?
}
