import Foundation

struct MarketEngine {
    struct TradeMatch: Identifiable {
        let teamA: String
        let teamB: String
        let aWants: [DisplayAsset]   // assets owned by teamB that teamA flagged
        let bWants: [DisplayAsset]   // assets owned by teamA that teamB flagged
        var id: String { "\(teamA)↔\(teamB)" }
    }

    static func findMatches(
        interests: [PlayerInterest],
        assets: [DisplayAsset],
        priorityTeam: String? = nil
    ) -> [TradeMatch] {
        var teamInterests: [String: Set<String>] = [:]
        for i in interests {
            guard let team = i.teamName else { continue }
            teamInterests[team, default: []].insert(i.assetId)
        }

        var assetOwner: [String: String] = [:]
        var assetById: [String: DisplayAsset] = [:]
        for a in assets {
            assetOwner[a.assetId] = a.teamName
            assetById[a.assetId] = a
        }

        var results: [TradeMatch] = []
        let teams = Array(teamInterests.keys)
        for i in 0..<teams.count {
            for j in (i + 1)..<teams.count {
                let a = teams[i], b = teams[j]
                let aWantsIds = (teamInterests[a] ?? []).filter { assetOwner[$0] == b }
                let bWantsIds = (teamInterests[b] ?? []).filter { assetOwner[$0] == a }
                guard !aWantsIds.isEmpty, !bWantsIds.isEmpty else { continue }

                let aAssets = aWantsIds.compactMap { assetById[$0] }
                let bAssets = bWantsIds.compactMap { assetById[$0] }
                results.append(TradeMatch(teamA: a, teamB: b, aWants: aAssets, bWants: bAssets))
            }
        }

        if let priority = priorityTeam {
            return results.sorted { m, _ in m.teamA == priority || m.teamB == priority }
        }
        return results
    }
}
