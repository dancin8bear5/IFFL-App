import SwiftUI

// MARK: - MarketView (Tab 3)

struct MarketView: View {
    @EnvironmentObject var appState: AppState
    @State private var section: MarketSection = .interest
    @State private var showSettings = false

    enum MarketSection: String, CaseIterable {
        case interest = "Interest"
        case matches  = "Matches"
        case trades   = "Trades"
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Color.iffBg.ignoresSafeArea()
                VStack(spacing: 0) {
                    sectionPicker
                    switch section {
                    case .interest: FMKSwiperView()
                    case .matches:  MatchesView()
                    case .trades:   TradeHistorySection()
                    }
                }
            }
            .navigationTitle("Market")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    HStack(spacing: 12) {
                        NavigationLink(destination: TradeProposalView()) {
                            Image(systemName: "plus.circle.fill")
                                .foregroundColor(Color.iffAccent)
                                .font(.title3)
                        }
                        Button { showSettings = true } label: {
                            Image(systemName: "gearshape.fill")
                                .foregroundColor(Color.iffSubtext)
                        }
                    }
                }
            }
            .sheet(isPresented: $showSettings) {
                SettingsView().environmentObject(appState)
            }
            .onAppear { appState.loadAllLeagueInterests() }
        }
    }

    private var sectionPicker: some View {
        Picker("Section", selection: $section) {
            ForEach(MarketSection.allCases, id: \.self) { Text($0.rawValue).tag($0) }
        }
        .pickerStyle(.segmented)
        .padding()
        .background(Color.iffBg)
    }
}

// MARK: - Interest Board

struct InterestBoardView: View {
    @EnvironmentObject var appState: AppState
    @State private var filter: InterestFilter = .all

    enum InterestFilter: String, CaseIterable {
        case all      = "All"
        case myAssets = "My Assets"
        case watching = "Watching"
    }

    private var interestsByAsset: [(asset: DisplayAsset, teams: [String])] {
        var grouped: [String: [String]] = [:]
        for interest in appState.allLeagueInterests {
            grouped[interest.assetId, default: []].append(interest.teamName ?? "Unknown")
        }

        return appState.allDisplayAssets.compactMap { asset -> (DisplayAsset, [String])? in
            guard let teams = grouped[asset.assetId], !teams.isEmpty else { return nil }
            return (asset, teams)
        }
        .filter { pair in
            switch filter {
            case .all:      return true
            case .myAssets: return pair.0.teamName == appState.userTeam
            case .watching: return appState.interestedAssetIds.contains(pair.0.assetId)
            }
        }
        .sorted { $0.teams.count > $1.teams.count }
    }

    var body: some View {
        VStack(spacing: 0) {
            filterBar
            if interestsByAsset.isEmpty {
                emptyState
            } else {
                ScrollView {
                    LazyVStack(spacing: 10) {
                        ForEach(interestsByAsset, id: \.asset.id) { pair in
                            InterestRow(asset: pair.asset, interestedTeams: pair.teams)
                        }
                    }
                    .padding()
                }
            }
        }
    }

    private var filterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(InterestFilter.allCases, id: \.self) { f in
                    Button { filter = f } label: {
                        Text(f.rawValue)
                            .font(.caption.bold())
                            .foregroundColor(filter == f ? .white : Color.iffSubtext)
                            .padding(.horizontal, 12).padding(.vertical, 6)
                            .background(filter == f ? Color.iffAccent : Color.iffSurface)
                            .clipShape(Capsule())
                    }
                }
            }
            .padding(.horizontal).padding(.vertical, 8)
        }
        .background(Color.iffBg)
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Spacer()
            Image(systemName: "star.slash")
                .font(.system(size: 44)).foregroundColor(Color.iffSubtext)
            Text("No interest flagged yet")
                .font(.headline).foregroundColor(Color.iffSubtext)
            Text("Swipe left on any player in Rosters to mark interest.")
                .font(.caption).foregroundColor(Color.iffSubtext.opacity(0.7))
                .multilineTextAlignment(.center).padding(.horizontal)
            Spacer()
        }
    }
}

struct InterestRow: View {
    @EnvironmentObject var appState: AppState
    let asset: DisplayAsset
    let interestedTeams: [String]

    var body: some View {
        NavigationLink(destination: AssetDetailView(asset: asset)) {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(asset.name)
                            .font(.subheadline.bold()).foregroundColor(.white)
                        Text("\(asset.isPick ? "Pick" : asset.position) · \(asset.teamName)")
                            .font(.caption).foregroundColor(Color.iffSubtext)
                    }
                    Spacer()
                    Text(asset.formattedCurrentPrice)
                        .font(.subheadline.bold()).foregroundColor(Color.iffGold)
                }

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(interestedTeams, id: \.self) { team in
                            Text(team)
                                .font(.caption2.bold())
                                .foregroundColor(team == appState.userTeam ? .black : Color.iffSubtext)
                                .padding(.horizontal, 8).padding(.vertical, 3)
                                .background(team == appState.userTeam ? Color.iffAccent : Color.iffElevated)
                                .clipShape(Capsule())
                        }
                    }
                }
            }
            .padding()
        }
        .iffCard()
    }
}

// MARK: - Matches View

struct MatchesView: View {
    @EnvironmentObject var appState: AppState
    @State private var showProposal = false

    private var matches: [MarketEngine.TradeMatch] {
        MarketEngine.findMatches(
            fmkSignals: appState.allLeagueFMK,
            assets: appState.allDisplayAssets,
            priorityTeam: appState.userTeam
        )
    }

    var body: some View {
        Group {
            if matches.isEmpty {
                VStack(spacing: 14) {
                    Spacer()
                    Image(systemName: "arrow.left.arrow.right.circle")
                        .font(.system(size: 48)).foregroundColor(Color.iffSubtext)
                    Text("No matches yet")
                        .font(.headline).foregroundColor(Color.iffSubtext)
                    Text("Matches appear when two teams both have\nFuck/Marry signals on each other's players\nat similar trade value.")
                        .font(.caption).foregroundColor(Color.iffSubtext.opacity(0.7))
                        .multilineTextAlignment(.center).padding(.horizontal)
                    Spacer()
                }
            } else {
                ScrollView {
                    LazyVStack(spacing: 12) {
                        ForEach(matches) { match in
                            MatchCard(match: match) {
                                prefillFromMatch(match)
                                showProposal = true
                            }
                        }
                    }
                    .padding()
                }
            }
        }
        .navigationDestination(isPresented: $showProposal) {
            TradeProposalView()
        }
    }

    private func prefillFromMatch(_ match: MarketEngine.TradeMatch) {
        let userIsA = match.teamA == appState.userTeam
        let userIsB = match.teamB == appState.userTeam
        guard userIsA || userIsB else { return }
        let theirCandidates = userIsA ? match.aWants : match.bWants
        if let first = theirCandidates.first {
            appState.selectedAssetForTrade = first.asset
        }
    }
}

struct MatchCard: View {
    @EnvironmentObject var appState: AppState
    let match: MarketEngine.TradeMatch
    let onPropose: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            HStack {
                teamLabel(match.teamA)
                Spacer()
                VStack(spacing: 2) {
                    Image(systemName: "arrow.left.arrow.right")
                        .foregroundColor(Color.iffSubtext)
                    Text("Match Score: \(match.matchScore)")
                        .font(.caption2).foregroundColor(Color.iffSubtext)
                }
                Spacer()
                teamLabel(match.teamB)
            }

            HStack(alignment: .top, spacing: 12) {
                candidateList(title: "\(match.teamA) wants:", candidates: match.aWants, aligned: .leading)
                Spacer()
                candidateList(title: "\(match.teamB) wants:", candidates: match.bWants, aligned: .trailing)
            }

            Button(action: onPropose) {
                Text("Propose Trade")
                    .font(.caption.bold()).foregroundColor(.white)
                    .frame(maxWidth: .infinity).padding(.vertical, 8)
                    .background(Color.iffAccent).cornerRadius(8)
            }
        }
        .padding()
        .iffCard()
    }

    private func teamLabel(_ name: String) -> some View {
        Text(name)
            .font(.subheadline.bold())
            .foregroundColor(name == appState.userTeam ? Color.iffAccent : .white)
    }

    @ViewBuilder
    private func candidateList(title: String, candidates: [MarketEngine.MatchCandidate], aligned: HorizontalAlignment) -> some View {
        VStack(alignment: aligned, spacing: 4) {
            Text(title).font(.caption).foregroundColor(Color.iffSubtext)
            ForEach(candidates, id: \.asset.id) { candidate in
                HStack(spacing: 3) {
                    Text(candidate.signal.emoji).font(.caption)
                    Text(candidate.asset.name).font(.caption.bold()).foregroundColor(.white)
                    if candidate.ownerSignal == .kill {
                        Text("💀").font(.caption2)
                    }
                }
            }
        }
    }
}

// MARK: - Trade History Section

struct TradeHistorySection: View {
    @EnvironmentObject var appState: AppState
    @State private var searchQuery = ""

    private var pending: [Trade] {
        appState.trades
            .filter { $0.status == .proposed || $0.status == .accepted }
            .sorted { $0.date > $1.date }
    }

    private var completed: [Trade] {
        let base = appState.trades.filter {
            $0.season == appState.activeSeason &&
            ($0.status == .completed || $0.status == .historical)
        }
        guard !searchQuery.isEmpty else { return base.sorted { $0.date > $1.date } }
        let q = searchQuery.lowercased()
        return base.filter {
            $0.proposingTeamName.lowercased().contains(q) ||
            $0.receivingTeamName.lowercased().contains(q) ||
            $0.proposerAssetNames.joined().lowercased().contains(q)
        }.sorted { $0.date > $1.date }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if !pending.isEmpty { pendingSection }
                completedSection
            }
            .padding()
        }
    }

    // MARK: Pending

    private var pendingSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Pending").font(.headline).foregroundColor(.white)
            ForEach(pending) { trade in
                NavigationLink(destination: TradeDetailView(trade: trade)) {
                    HStack {
                        VStack(alignment: .leading, spacing: 3) {
                            Text("\(trade.proposingTeamName) → \(trade.receivingTeamName)")
                                .font(.subheadline.bold()).foregroundColor(.white)
                            Text(trade.proposerAssetNames.prefix(2).joined(separator: ", "))
                                .font(.caption).foregroundColor(Color.iffSubtext).lineLimit(1)
                        }
                        Spacer()
                        statusBadge(trade.status)
                    }
                    .padding()
                    .iffCard()
                }
            }
        }
    }

    private func statusBadge(_ status: TradeStatus) -> some View {
        Text(status == .proposed ? "Proposed" : "Accepted")
            .font(.caption2.bold()).foregroundColor(.white)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(status == .accepted ? Color.green.opacity(0.7) : Color.iffGold.opacity(0.8))
            .clipShape(Capsule())
    }

    // MARK: Completed

    private var completedSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("\(appState.activeSeason) Trades")
                    .font(.headline).foregroundColor(.white)
                Spacer()
                NavigationLink(destination: HistoricalTradesView()) {
                    Text("History").font(.caption.bold()).foregroundColor(Color.iffAccent)
                }
            }

            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundColor(Color.iffSubtext)
                TextField("Search", text: $searchQuery)
                    .foregroundColor(.white).autocapitalization(.none)
            }
            .padding(8)
            .background(Color.iffSurface)
            .cornerRadius(8)

            if completed.isEmpty {
                Text("No trades this season.")
                    .font(.caption).foregroundColor(Color.iffSubtext).padding(.top, 8)
            } else {
                ForEach(completed) { trade in
                    NavigationLink(destination: TradeDetailView(trade: trade)) {
                        HStack {
                            VStack(alignment: .leading, spacing: 3) {
                                Text("\(trade.proposingTeamName) ↔ \(trade.receivingTeamName)")
                                    .font(.subheadline.bold()).foregroundColor(.white)
                                Text(trade.proposerAssetNames.prefix(2).joined(separator: ", "))
                                    .font(.caption).foregroundColor(Color.iffSubtext).lineLimit(1)
                            }
                            Spacer()
                            Text(trade.formattedDate).font(.caption).foregroundColor(Color.iffSubtext)
                        }
                        .padding()
                        .iffCard()
                    }
                }
            }
        }
    }
}
