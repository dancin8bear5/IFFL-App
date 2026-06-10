import Foundation
import Firebase
import FirebaseFirestore
import FirebaseAuth

// MARK: - FirestoreDataService
// Single service replacing both SheetsService and the old FirestoreService.
// All writes that mutate ownership (trade execution, pick conversion) use
// batch writes for atomicity.

class FirestoreDataService: ObservableObject {

    private let db = Firestore.firestore()

    // MARK: - Firestore Collection Names

    private enum Col {
        static let players       = "players"
        static let draftPicks    = "draftPicks"
        static let trades        = "trades"
        static let interests     = "playerInterests"
        static let messages      = "messages"
        static let config        = "config"
        static let seasons       = "seasons"
        static let fmk           = "playerFMK"
        static let userSettings  = "userSettings"
        static let leagueHistory = "leagueHistory"
    }

    // MARK: - League Config

    func fetchLeagueConfig(completion: @escaping (LeagueConfig?) -> Void) {
        db.collection(Col.config).document("league").getDocument { snapshot, _ in
            let config = try? snapshot?.data(as: LeagueConfig.self)
            completion(config)
        }
    }

    func isAuthorized(uid: String, completion: @escaping (Bool) -> Void) {
        fetchLeagueConfig { config in
            completion(config?.authorizedUIDs.contains(uid) ?? false)
        }
    }

    func addAuthorizedUID(_ uid: String, completion: @escaping (Error?) -> Void) {
        db.collection(Col.config).document("league").updateData([
            "authorizedUIDs": FieldValue.arrayUnion([uid])
        ], completion: completion)
    }

    func removeAuthorizedUID(_ uid: String, completion: @escaping (Error?) -> Void) {
        db.collection(Col.config).document("league").updateData([
            "authorizedUIDs": FieldValue.arrayRemove([uid])
        ], completion: completion)
    }

    func updateActiveSeasonYear(_ year: Int, completion: @escaping (Error?) -> Void) {
        db.collection(Col.config).document("league").updateData([
            "activeSeasonYear": year
        ], completion: completion)
    }

    /// Assigns a fantasy team to a Firebase Auth UID in the userTeamMap.
    func assignTeam(uid: String, teamName: String, completion: @escaping (Error?) -> Void) {
        db.collection(Col.config).document("league").updateData([
            "userTeamMap.\(uid)": teamName
        ], completion: completion)
    }

    /// Removes a UID's team assignment from the userTeamMap.
    func removeTeamAssignment(uid: String, completion: @escaping (Error?) -> Void) {
        db.collection(Col.config).document("league").updateData([
            "userTeamMap.\(uid)": FieldValue.delete()
        ], completion: completion)
    }

    /// Reads the legacy Users collection (uid → teamname) and writes all entries
    /// into config/league.userTeamMap in one batch. Safe to run multiple times.
    func migrateUserTeamMapFromUsersCollection(completion: @escaping (Result<Int, Error>) -> Void) {
        db.collection("Users").getDocuments { [self] snapshot, error in
            if let error = error { completion(.failure(error)); return }
            guard let docs = snapshot?.documents, !docs.isEmpty else {
                completion(.success(0)); return
            }

            var map: [String: Any] = [:]
            for doc in docs {
                if let teamName = doc.data()["teamname"] as? String {
                    map["userTeamMap.\(doc.documentID)"] = teamName
                }
            }

            guard !map.isEmpty else { completion(.success(0)); return }
            db.collection(Col.config).document("league").updateData(map) { error in
                if let error = error { completion(.failure(error)) }
                else { completion(.success(map.count)) }
            }
        }
    }

    // MARK: - Players

    /// Returns a real-time listener. Caller must retain and call .remove() on deinit.
    @discardableResult
    func listenToPlayers(completion: @escaping ([Player], Error?) -> Void) -> ListenerRegistration {
        db.collection(Col.players)
            .whereField("isActive", isEqualTo: true)
            .addSnapshotListener { snapshot, error in
                if let error = error {
                    completion([], error)
                    return
                }
                let players = snapshot?.documents.compactMap { try? $0.data(as: Player.self) } ?? []
                completion(players, nil)
            }
    }

    func addPlayer(_ player: Player, completion: @escaping (Error?) -> Void) {
        do {
            _ = try db.collection(Col.players).addDocument(from: player, completion: completion)
        } catch {
            completion(error)
        }
    }

    func updatePlayer(_ player: Player, completion: @escaping (Error?) -> Void) {
        guard let id = player.id else { completion(nil); return }
        do {
            try db.collection(Col.players).document(id).setData(from: player, completion: completion)
        } catch {
            completion(error)
        }
    }

    /// Transfers a player to a new team. Appends a note to tradeHistory.
    func transferPlayer(playerId: String, toTeam: String, tradeNote: String?, completion: @escaping (Error?) -> Void) {
        var updates: [String: Any] = ["teamName": toTeam]
        if let note = tradeNote {
            updates["tradeHistory"] = FieldValue.arrayUnion([note])
        }
        db.collection(Col.players).document(playerId).updateData(updates, completion: completion)
    }

    func deactivatePlayer(playerId: String, completion: @escaping (Error?) -> Void) {
        db.collection(Col.players).document(playerId).updateData(
            ["isActive": false], completion: completion
        )
    }

    // MARK: - Draft Picks

    @discardableResult
    func listenToDraftPicks(completion: @escaping ([DraftPickAsset], Error?) -> Void) -> ListenerRegistration {
        db.collection(Col.draftPicks)
            .whereField("status", isEqualTo: PickStatus.available.rawValue)
            .addSnapshotListener { snapshot, error in
                if let error = error {
                    completion([], error)
                    return
                }
                let picks = snapshot?.documents.compactMap { try? $0.data(as: DraftPickAsset.self) } ?? []
                completion(picks, nil)
            }
    }

    func addDraftPick(_ pick: DraftPickAsset, completion: @escaping (Error?) -> Void) {
        do {
            _ = try db.collection(Col.draftPicks).addDocument(from: pick, completion: completion)
        } catch {
            completion(error)
        }
    }

    func transferDraftPick(pickId: String, toTeam: String, tradeNote: String, completion: @escaping (Error?) -> Void) {
        db.collection(Col.draftPicks).document(pickId).updateData([
            "currentTeamName": toTeam,
            "tradeHistory": FieldValue.arrayUnion([tradeNote])
        ], completion: completion)
    }

    /// Commissioner action: convert a draft pick into a player after the rookie draft.
    /// Creates a new Player document and marks the pick as used — atomically.
    func convertPickToPlayer(
        pick: DraftPickAsset,
        playerName: String,
        nflTeam: String?,
        position: String,
        completion: @escaping (Error?) -> Void
    ) {
        guard let pickId = pick.id else {
            completion(NSError(domain: "CodeRed", code: -1, userInfo: [NSLocalizedDescriptionKey: "Pick has no Firestore ID"]))
            return
        }

        let batch = db.batch()

        // 1. Mark pick as used
        let pickRef = db.collection(Col.draftPicks).document(pickId)
        batch.updateData([
            "status": PickStatus.used.rawValue,
            "playerName": playerName,
            "nflTeam": nflTeam as Any
        ], forDocument: pickRef)

        // 2. Create new player document
        let newPlayerRef = db.collection(Col.players).document()
        var player = Player(
            teamName: pick.currentTeamName,
            position: position,
            name: playerName,
            prices: pick.prices,
            originalPrice: pick.prices[String(pick.season)] ?? 0,
            purchaseYear: pick.season,
            contractYearsRemaining: 1,
            playerPool: "Rookie Draft",
            rookieRound: pick.round,
            rookieDraftYear: pick.season,
            tradeHistory: pick.tradeHistory,
            isActive: true,
            acquiredSeason: pick.season
        )
        player.id = newPlayerRef.documentID

        do {
            try batch.setData(from: player, forDocument: newPlayerRef)
        } catch {
            completion(error)
            return
        }

        batch.commit(completion: completion)
    }

    // MARK: - Trades

    @discardableResult
    func listenToTrades(season: Int, completion: @escaping ([Trade], Error?) -> Void) -> ListenerRegistration {
        db.collection(Col.trades)
            .whereField("season", isEqualTo: season)
            .order(by: "date", descending: true)
            .addSnapshotListener { snapshot, error in
                if let error = error {
                    completion([], error)
                    return
                }
                let trades = snapshot?.documents.compactMap { try? $0.data(as: Trade.self) } ?? []
                completion(trades, nil)
            }
    }

    /// Any owner can propose a trade. Status = .proposed.
    func proposeTrade(_ trade: Trade, completion: @escaping (Error?) -> Void) {
        do {
            _ = try db.collection(Col.trades).addDocument(from: trade, completion: completion)
        } catch {
            completion(error)
        }
    }

    /// Receiving team responds (yes/no/maybe). Does NOT execute the transfer.
    func respondToTrade(tradeId: String, response: TradeResponse, completion: @escaping (Error?) -> Void) {
        let status: TradeStatus = response == .no ? .rejected : .accepted
        db.collection(Col.trades).document(tradeId).updateData([
            "response": response.rawValue,
            "status": status.rawValue
        ], completion: completion)
    }

    /// Receiving team counters: marks original as .countered and creates the counter-offer document atomically.
    func counterOffer(originalTradeId: String, counter: Trade, completion: @escaping (Error?) -> Void) {
        let batch = db.batch()
        let originalRef = db.collection(Col.trades).document(originalTradeId)
        batch.updateData(["status": TradeStatus.countered.rawValue], forDocument: originalRef)
        let counterRef = db.collection(Col.trades).document()
        do {
            try batch.setData(from: counter, forDocument: counterRef)
            batch.commit(completion: completion)
        } catch {
            completion(error)
        }
    }

    /// Commissioner-only: atomically transfers all assets and marks the trade completed.
    /// Call this after the ESPN confirmation email is received and verified.
    func executeTrade(tradeId: String, completion: @escaping (Error?) -> Void) {
        let tradeRef = db.collection(Col.trades).document(tradeId)

        tradeRef.getDocument { snapshot, error in
            if let error = error { completion(error); return }
            guard let trade = try? snapshot?.data(as: Trade.self) else {
                completion(NSError(domain: "CodeRed", code: -2, userInfo: [NSLocalizedDescriptionKey: "Could not decode trade"]))
                return
            }

            let batch = self.db.batch()
            let tradeNote = "via \(trade.proposingTeamName) ↔ \(trade.receivingTeamName) (\(trade.formattedDate))"

            // Transfer proposer's assets → receiver
            for asset in trade.assetsFromProposer {
                self.applyTransfer(
                    batch: batch,
                    assetType: asset.assetType,
                    assetId: asset.assetId,
                    toTeam: trade.receivingTeamName,
                    tradeNote: tradeNote
                )
            }

            // Transfer receiver's assets → proposer
            for asset in trade.assetsFromReceiver {
                self.applyTransfer(
                    batch: batch,
                    assetType: asset.assetType,
                    assetId: asset.assetId,
                    toTeam: trade.proposingTeamName,
                    tradeNote: tradeNote
                )
            }

            // Mark trade completed
            batch.updateData([
                "status": TradeStatus.completed.rawValue,
                "completedAt": Timestamp(date: Date())
            ], forDocument: tradeRef)

            batch.commit(completion: completion)
        }
    }

    private func applyTransfer(batch: WriteBatch, assetType: AssetType, assetId: String, toTeam: String, tradeNote: String) {
        switch assetType {
        case .player:
            let ref = db.collection(Col.players).document(assetId)
            batch.updateData([
                "teamName": toTeam,
                "tradeHistory": FieldValue.arrayUnion([tradeNote])
            ], forDocument: ref)
        case .draftPick:
            let ref = db.collection(Col.draftPicks).document(assetId)
            batch.updateData([
                "currentTeamName": toTeam,
                "tradeHistory": FieldValue.arrayUnion([tradeNote])
            ], forDocument: ref)
        }
    }

    // MARK: - Player Interests

    func addPlayerInterest(_ interest: PlayerInterest, completion: @escaping (Error?) -> Void) {
        do {
            _ = try db.collection(Col.interests).addDocument(from: interest, completion: completion)
        } catch {
            completion(error)
        }
    }

    func removePlayerInterest(assetId: String, userId: String, completion: @escaping (Error?) -> Void) {
        db.collection(Col.interests)
            .whereField("assetId", isEqualTo: assetId)
            .whereField("userId", isEqualTo: userId)
            .getDocuments { snapshot, error in
                if let error = error { completion(error); return }
                guard let docs = snapshot?.documents, !docs.isEmpty else { completion(nil); return }
                let batch = self.db.batch()
                docs.forEach { batch.deleteDocument($0.reference) }
                batch.commit(completion: completion)
            }
    }

    func getPlayerInterests(for userId: String, completion: @escaping ([PlayerInterest]?, Error?) -> Void) {
        db.collection(Col.interests)
            .whereField("userId", isEqualTo: userId)
            .getDocuments { snapshot, error in
                if let error = error { completion(nil, error); return }
                let interests = snapshot?.documents.compactMap { try? $0.data(as: PlayerInterest.self) }
                completion(interests, nil)
            }
    }

    func fetchAllInterests(completion: @escaping ([PlayerInterest]?, Error?) -> Void) {
        db.collection(Col.interests).getDocuments { snapshot, error in
            if let error = error { completion(nil, error); return }
            let interests = snapshot?.documents.compactMap { try? $0.data(as: PlayerInterest.self) }
            completion(interests, nil)
        }
    }

    // MARK: - Messages

    func addMessage(content: String, completion: @escaping (Error?) -> Void) {
        db.collection(Col.messages).addDocument(data: [
            "content": content,
            "timestamp": Timestamp(date: Date())
        ], completion: completion)
    }

    func deleteMessage(messageId: String, completion: @escaping (Error?) -> Void) {
        db.collection(Col.messages).document(messageId).delete(completion: completion)
    }

    @discardableResult
    func listenToMessages(completion: @escaping ([Message]?, Error?) -> Void) -> ListenerRegistration {
        db.collection(Col.messages)
            .order(by: "timestamp", descending: true)
            .limit(to: 20)
            .addSnapshotListener { snapshot, error in
                if let error = error { completion(nil, error); return }
                let messages = snapshot?.documents.compactMap { try? $0.data(as: Message.self) }
                completion(messages, nil)
            }
    }

    // MARK: - Off-Season Toggle

    func setOffSeason(_ isOffSeason: Bool, completion: @escaping (Error?) -> Void) {
        db.collection(Col.config).document("league").updateData([
            "isOffSeason": isOffSeason
        ], completion: completion)
    }

    // MARK: - FMK Signals

    func setFMKSignal(_ fmk: PlayerFMK, completion: @escaping (Error?) -> Void) {
        let docId = "\(fmk.userId)_\(fmk.assetId)"
        do {
            try db.collection(Col.fmk).document(docId).setData(from: fmk, merge: false, completion: completion)
        } catch { completion(error) }
    }

    func getFMKSignals(for userId: String, completion: @escaping ([PlayerFMK]?, Error?) -> Void) {
        db.collection(Col.fmk)
            .whereField("userId", isEqualTo: userId)
            .getDocuments { snapshot, error in
                if let error { completion(nil, error); return }
                let signals = snapshot?.documents.compactMap { try? $0.data(as: PlayerFMK.self) }
                completion(signals, nil)
            }
    }

    @discardableResult
    func listenToAllFMKSignals(completion: @escaping ([PlayerFMK], Error?) -> Void) -> ListenerRegistration {
        db.collection(Col.fmk)
            .addSnapshotListener { snapshot, error in
                if let error { completion([], error); return }
                let signals = snapshot?.documents.compactMap { try? $0.data(as: PlayerFMK.self) } ?? []
                completion(signals, nil)
            }
    }

    func removeFMKSignal(userId: String, assetId: String, completion: @escaping (Error?) -> Void) {
        db.collection(Col.fmk).document("\(userId)_\(assetId)").delete(completion: completion)
    }

    // MARK: - User Settings

    func fetchUserSettings(userId: String, completion: @escaping (UserSettings?) -> Void) {
        db.collection(Col.userSettings).document(userId).getDocument { snapshot, _ in
            let settings = try? snapshot?.data(as: UserSettings.self)
            completion(settings)
        }
    }

    func saveUserSettings(_ settings: UserSettings, userId: String, completion: @escaping (Error?) -> Void) {
        do {
            try db.collection(Col.userSettings).document(userId).setData(from: settings, merge: false, completion: completion)
        } catch { completion(error) }
    }

    // MARK: - League History

    func fetchLeagueHistory(completion: @escaping ([SeasonHistory]?, Error?) -> Void) {
        db.collection(Col.leagueHistory)
            .order(by: "season", descending: true)
            .getDocuments { snapshot, error in
                if let error { completion(nil, error); return }
                let history = snapshot?.documents.compactMap { try? $0.data(as: SeasonHistory.self) }
                completion(history, nil)
            }
    }

    func addSeasonHistory(_ history: SeasonHistory, completion: @escaping (Error?) -> Void) {
        let docId = String(history.season)
        do {
            try db.collection(Col.leagueHistory).document(docId).setData(from: history, completion: completion)
        } catch { completion(error) }
    }

    // MARK: - Bulk NFL Team Update

    func bulkSetNFLTeams(_ mapping: [String: String], completion: @escaping (Result<Int, Error>) -> Void) {
        db.collection(Col.players).getDocuments { [self] snapshot, error in
            if let error { completion(.failure(error)); return }
            guard let docs = snapshot?.documents else { completion(.success(0)); return }

            let toUpdate = docs.filter { doc in
                let name = doc.data()["name"] as? String ?? ""
                return mapping[name] != nil
            }

            guard !toUpdate.isEmpty else { completion(.success(0)); return }

            let chunks = stride(from: 0, to: toUpdate.count, by: 400).map {
                Array(toUpdate[$0..<min($0 + 400, toUpdate.count)])
            }

            var errors: [Error] = []
            let group = DispatchGroup()
            var updated = 0

            for chunk in chunks {
                group.enter()
                let batch = db.batch()
                for doc in chunk {
                    let name = doc.data()["name"] as? String ?? ""
                    if let nflTeam = mapping[name] {
                        batch.updateData(["nflTeam": nflTeam], forDocument: doc.reference)
                        updated += 1
                    }
                }
                batch.commit { e in
                    if let e { errors.append(e) }
                    group.leave()
                }
            }

            group.notify(queue: .main) {
                if let first = errors.first { completion(.failure(first)) }
                else { completion(.success(updated)) }
            }
        }
    }

    // MARK: - Seeding Guard

    /// Returns true if the database already has player data (seeding was run previously).
    func isDatabaseSeeded(completion: @escaping (Bool) -> Void) {
        db.collection(Col.players).limit(to: 1).getDocuments { snapshot, _ in
            completion(!(snapshot?.documents.isEmpty ?? true))
        }
    }
}

// MARK: - Player memberwise init (needed since @DocumentID prevents auto-synthesis for seeding)

extension Player {
    init(
        teamName: String,
        position: String,
        name: String,
        prices: [String: Int],
        originalPrice: Int,
        purchaseYear: Int,
        contractYearsRemaining: Int,
        playerPool: String,
        rookieRound: Int? = nil,
        rookieDraftYear: Int? = nil,
        tradeHistory: [String] = [],
        isActive: Bool = true,
        acquiredSeason: Int,
        nflTeam: String? = nil
    ) {
        self.teamName               = teamName
        self.position               = position
        self.name                   = name
        self.prices                 = prices
        self.originalPrice          = originalPrice
        self.purchaseYear           = purchaseYear
        self.contractYearsRemaining = contractYearsRemaining
        self.playerPool             = playerPool
        self.rookieRound            = rookieRound
        self.rookieDraftYear        = rookieDraftYear
        self.tradeHistory           = tradeHistory
        self.isActive               = isActive
        self.acquiredSeason         = acquiredSeason
        self.nflTeam                = nflTeam
    }
}

extension DraftPickAsset {
    init(
        season: Int,
        round: Int,
        slot: Int? = nil,
        currentTeamName: String,
        originalTeamName: String,
        prices: [String: Int],
        tradeHistory: [String] = [],
        status: PickStatus = .available
    ) {
        self.season            = season
        self.round             = round
        self.slot              = slot
        self.currentTeamName   = currentTeamName
        self.originalTeamName  = originalTeamName
        self.prices            = prices
        self.tradeHistory      = tradeHistory
        self.status            = status
        self.convertedPlayerId = nil
        self.playerName        = nil
        self.nflTeam           = nil
    }
}
