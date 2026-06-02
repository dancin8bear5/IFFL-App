import Foundation

struct MarketEngine {

    // MARK: - TradeMatch

    struct TradeMatch: Identifiable {
        let teamA: String
        let teamB: String
        let aWants: [MatchCandidate]
        let bWants: [MatchCandidate]
        let matchScore: Int
        var id: String { "\(teamA)↔\(teamB)" }

        var aWantAssets: [DisplayAsset] { aWants.map { $0.asset } }
        var bWantAssets: [DisplayAsset] { bWants.map { $0.asset } }
    }

    struct MatchCandidate {
        let asset: DisplayAsset
        let signal: FMKSignal
        let ownerSignal: FMKSignal?
    }

    // MARK: - FMK-Aware Matching

    static func findMatches(
        fmkSignals: [PlayerFMK],
        assets: [DisplayAsset],
        priorityTeam: String? = nil,
        valueDiffThreshold: Double = 0.10
    ) -> [TradeMatch] {

        var assetOwner: [String: String] = [:]
        var assetById: [String: DisplayAsset] = [:]
        for a in assets {
            assetOwner[a.assetId] = a.teamName
            assetById[a.assetId] = a
        }

        // teamSignals[teamName][assetId] = FMKSignal
        var teamSignals: [String: [String: FMKSignal]] = [:]
        for fmk in fmkSignals {
            teamSignals[fmk.teamName, default: [:]][fmk.assetId] = fmk.signal
        }

        func wantScore(_ signal: FMKSignal) -> Int {
            switch signal {
            case .marry: return 2
            case .fuck:  return 1
            case .kill:  return 0
            }
        }

        var results: [TradeMatch] = []
        let teams = Array(teamSignals.keys)

        for i in 0..<teams.count {
            for j in (i + 1)..<teams.count {
                let teamA = teams[i]
                let teamB = teams[j]
                let aSignals = teamSignals[teamA] ?? [:]
                let bSignals = teamSignals[teamB] ?? [:]

                let aWantsIds = aSignals.filter { id, sig in
                    (sig == .fuck || sig == .marry) && assetOwner[id] == teamB
                }
                let bWantsIds = bSignals.filter { id, sig in
                    (sig == .fuck || sig == .marry) && assetOwner[id] == teamA
                }

                guard !aWantsIds.isEmpty, !bWantsIds.isEmpty else { continue }

                var bestAWants: [MatchCandidate] = []
                var bestBWants: [MatchCandidate] = []
                var matchScore = 0

                for (aId, aSig) in aWantsIds {
                    for (bId, bSig) in bWantsIds {
                        guard let aAsset = assetById[aId],
                              let bAsset = assetById[bId] else { continue }

                        let aPrice = Double(max(aAsset.currentPrice, 1))
                        let bPrice = Double(max(bAsset.currentPrice, 1))
                        let valueDiff = abs(aPrice - bPrice) / max(aPrice, bPrice)

                        guard valueDiff <= valueDiffThreshold else { continue }

                        let ownerASignal = bSignals[aId]  // B's signal for their own asset
                        let ownerBSignal = aSignals[bId]  // A's signal for their own asset

                        var pairScore = wantScore(aSig) + wantScore(bSig)
                        if ownerASignal == .kill { pairScore += 1 }
                        if ownerBSignal == .kill { pairScore += 1 }

                        if pairScore > 0 {
                            if !bestAWants.contains(where: { $0.asset.id == aAsset.id }) {
                                bestAWants.append(MatchCandidate(asset: aAsset, signal: aSig, ownerSignal: ownerASignal))
                            }
                            if !bestBWants.contains(where: { $0.asset.id == bAsset.id }) {
                                bestBWants.append(MatchCandidate(asset: bAsset, signal: bSig, ownerSignal: ownerBSignal))
                            }
                            matchScore = max(matchScore, pairScore)
                        }
                    }
                }

                guard !bestAWants.isEmpty, !bestBWants.isEmpty else { continue }

                results.append(TradeMatch(
                    teamA: teamA, teamB: teamB,
                    aWants: bestAWants, bWants: bestBWants,
                    matchScore: matchScore
                ))
            }
        }

        results.sort { $0.matchScore > $1.matchScore }

        if let priority = priorityTeam {
            let priorityMatches = results.filter { $0.teamA == priority || $0.teamB == priority }
            let others = results.filter { $0.teamA != priority && $0.teamB != priority }
            return priorityMatches + others
        }

        return results
    }

    // MARK: - Legacy Shim (PlayerInterest → FMK)

    static func findMatches(
        interests: [PlayerInterest],
        assets: [DisplayAsset],
        priorityTeam: String? = nil
    ) -> [TradeMatch] {
        let syntheticFMK = interests.compactMap { interest -> PlayerFMK? in
            guard let team = interest.teamName else { return nil }
            return PlayerFMK(
                id: interest.id,
                userId: interest.userId,
                teamName: team,
                assetId: interest.assetId,
                assetName: "",
                assetOwnerTeam: assets.first(where: { $0.assetId == interest.assetId })?.teamName ?? "",
                signal: .fuck,
                timestamp: interest.timestamp,
                updatedAt: interest.timestamp
            )
        }
        return findMatches(fmkSignals: syntheticFMK, assets: assets, priorityTeam: priorityTeam)
    }
}
