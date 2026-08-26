import Foundation
import Observation

/// Mutable in-progress trade proposal. Held by the propose-trade flow.
/// Computes live cap-impact previews as assets are toggled.
@MainActor
@Observable
final class TradeProposalDraft {
    /// The proposing team (current user's team).
    var myTeam: LeagueRepository.TeamWithRoster
    var myContracts: [LeagueRepository.ContractWithPlayer] = []
    var myPicks: [RookiePick] = []

    /// The counterparty's team. Nil until step 1 completes.
    var theirTeam: LeagueRepository.TeamWithRoster?
    var theirContracts: [LeagueRepository.ContractWithPlayer] = []
    var theirPicks: [RookiePick] = []

    /// Selected asset IDs (contracts + picks).
    var myContractsGiving: Set<UUID> = []
    var theirContractsGiving: Set<UUID> = []
    var myPicksGiving: Set<UUID> = []
    var theirPicksGiving: Set<UUID> = []

    /// FAAB cash being included (each side).
    var myFAABGiving: Decimal = 0
    var theirFAABGiving: Decimal = 0

    /// Free-text notes attached to the proposal.
    var notes: String = ""

    init(myTeam: LeagueRepository.TeamWithRoster) {
        self.myTeam = myTeam
    }

    // MARK: derived selections

    var myGivingContracts: [LeagueRepository.ContractWithPlayer] {
        myContracts.filter { myContractsGiving.contains($0.id) }
    }

    var theirGivingContracts: [LeagueRepository.ContractWithPlayer] {
        theirContracts.filter { theirContractsGiving.contains($0.id) }
    }

    var myGivingPicks: [RookiePick] {
        myPicks.filter { myPicksGiving.contains($0.id) }
    }

    var theirGivingPicks: [RookiePick] {
        theirPicks.filter { theirPicksGiving.contains($0.id) }
    }

    var hasAssetsBothSides: Bool {
        let mine = !myContractsGiving.isEmpty || !myPicksGiving.isEmpty || myFAABGiving > 0
        let theirs = !theirContractsGiving.isEmpty || !theirPicksGiving.isEmpty || theirFAABGiving > 0
        return mine && theirs
    }

    // MARK: cap-impact projection

    /// My team's cap salary AFTER the trade closes.
    var myProjectedCap: Decimal {
        let removed = myGivingContracts
            .filter { !$0.isWaiverBaseline }
            .reduce(Decimal(0)) { $0 + $1.currentKeeperCost }
        let added = theirGivingContracts
            .filter { !$0.isWaiverBaseline }
            .reduce(Decimal(0)) { $0 + $1.currentKeeperCost }
        return myTeam.capSalary - removed + added
    }

    /// Their projected cap.
    var theirProjectedCap: Decimal {
        guard let theirTeam else { return 0 }
        let removed = theirGivingContracts
            .filter { !$0.isWaiverBaseline }
            .reduce(Decimal(0)) { $0 + $1.currentKeeperCost }
        let added = myGivingContracts
            .filter { !$0.isWaiverBaseline }
            .reduce(Decimal(0)) { $0 + $1.currentKeeperCost }
        return theirTeam.capSalary - removed + added
    }

    var myCrossesCap: Bool { myProjectedCap > 300 }
    var theirCrossesCap: Bool { (theirTeam != nil) && theirProjectedCap > 300 }
}

/// Lightweight summary returned from PostgREST for picks (not full ContractWithPlayer).
public struct RookiePick: Identifiable, Hashable, Sendable, Codable {
    public let id: UUID
    public let pickYear: Int
    public let round: Int
    public let slot: Int?
    public let ownerTeamId: UUID?

    public var label: String {
        if let slot { return "\(pickYear) \(round).\(String(format: "%02d", slot))" }
        return "\(pickYear) Round \(round)"
    }

    enum CodingKeys: String, CodingKey {
        case id
        case pickYear = "pick_year"
        case round, slot
        case ownerTeamId = "owner_team_id"
    }
}
