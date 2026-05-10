import SwiftUI

// MARK: - RostersView (top-level tab)

struct RostersView: View {
    @State private var mode: RosterMode = .teams

    enum RosterMode: String, CaseIterable {
        case teams = "By Team"
        case all   = "All Assets"
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Color.iffBg.ignoresSafeArea()
                VStack(spacing: 0) {
                    Picker("Mode", selection: $mode) {
                        ForEach(RosterMode.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .padding()
                    .background(Color.iffBg)

                    if mode == .teams {
                        TeamRosterView()
                    } else {
                        AllAssetsView()
                    }
                }
            }
            .navigationTitle("Rosters")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

// MARK: - By-Team View

struct TeamRosterView: View {
    @EnvironmentObject var appState: AppState

    private var teamAssets: [DisplayAsset] {
        appState.allDisplayAssets
            .filter { $0.teamName == appState.selectedTeam }
            .sorted { $0.currentPrice > $1.currentPrice }
    }

    var body: some View {
        VStack(spacing: 0) {
            Picker("Team", selection: $appState.selectedTeam) {
                ForEach(fantasyTeams.map { $0.name }, id: \.self) { Text($0).tag($0) }
            }
            .pickerStyle(.menu)
            .font(.title2.bold())
            .foregroundColor(.white)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity)
            .background(Color.iffSurface)

            if !appState.isInitialLoadComplete {
                Spacer()
                ProgressView().tint(Color.iffAccent)
                Spacer()
            } else {
                List {
                    ForEach(teamAssets) { item in
                        NavigationLink(destination: AssetDetailView(asset: item)) {
                            AssetRow(item: item, activeSeason: appState.activeSeason)
                        }
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            if item.teamName != appState.userTeam {
                                Button {
                                    appState.toggleInterest(for: item) { _ in }
                                } label: {
                                    let on = appState.interestedAssetIds.contains(item.assetId)
                                    Label(on ? "Uninterested" : "Interested",
                                          systemImage: on ? "star.slash" : "star")
                                }
                                .tint(Color.iffAccent)
                            }
                        }
                        .listRowBackground(Color.iffSurface)
                        .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 16))
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
                .background(Color.iffBg)
            }
        }
    }
}

// MARK: - All Assets View

struct AllAssetsView: View {
    @EnvironmentObject var appState: AppState

    @State private var searchText = ""
    @State private var selectedPositions: Set<String> = ["All"]
    @State private var sortDesc = true

    private let allPositions = ["All", "QB", "RB", "WR", "TE", "Picks"]

    private var filtered: [DisplayAsset] {
        var result = appState.allDisplayAssets
        if !searchText.isEmpty {
            result = result.filter { $0.name.localizedCaseInsensitiveContains(searchText) }
        }
        if !selectedPositions.contains("All") {
            result = result.filter { item in
                if selectedPositions.contains("Picks") && item.isPick { return true }
                return selectedPositions.contains(item.position)
            }
        }
        return result.sorted { sortDesc ? $0.currentPrice > $1.currentPrice : $0.currentPrice < $1.currentPrice }
    }

    var body: some View {
        VStack(spacing: 0) {
            searchBar
            filterBar
            assetList
        }
    }

    private var searchBar: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").foregroundColor(Color.iffSubtext)
            TextField("Search players & picks…", text: $searchText)
                .foregroundColor(.white)
                .autocapitalization(.none)
            if !searchText.isEmpty {
                Button { searchText = "" } label: {
                    Image(systemName: "xmark.circle.fill").foregroundColor(Color.iffSubtext)
                }
            }
        }
        .padding(10)
        .background(Color.iffSurface)
        .cornerRadius(10)
        .padding(.horizontal)
        .padding(.vertical, 8)
        .background(Color.iffBg)
    }

    private var filterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(allPositions, id: \.self) { pos in
                    positionChip(pos)
                }
                Divider().frame(height: 20).background(Color.iffSubtext.opacity(0.3))
                Button {
                    sortDesc.toggle()
                } label: {
                    Label(sortDesc ? "↓ Price" : "↑ Price", systemImage: "arrow.up.arrow.down")
                        .font(.caption.bold())
                        .foregroundColor(Color.iffAccent)
                        .padding(.horizontal, 10).padding(.vertical, 6)
                        .background(Color.iffSurface)
                        .clipShape(Capsule())
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 6)
        }
        .background(Color.iffBg)
    }

    private func positionChip(_ pos: String) -> some View {
        let selected = selectedPositions.contains(pos)
        return Button {
            var s = selectedPositions
            if pos == "All" {
                s = s.contains("All") ? [] : Set(allPositions)
            } else {
                if s.contains(pos) { s.remove(pos) } else { s.insert(pos) }
                s.remove("All")
                if s.count == allPositions.count - 1 { s.insert("All") }
            }
            selectedPositions = s
        } label: {
            Text(pos)
                .font(.caption.bold())
                .foregroundColor(selected ? .white : Color.iffSubtext)
                .padding(.horizontal, 10).padding(.vertical, 6)
                .background(selected ? Color.iffAccent : Color.iffSurface)
                .clipShape(Capsule())
        }
    }

    private var assetList: some View {
        List {
            ForEach(filtered) { item in
                NavigationLink(destination: AssetDetailView(asset: item)) {
                    AssetRow(item: item, activeSeason: appState.activeSeason, compact: true)
                }
                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                    if item.teamName != appState.userTeam {
                        Button {
                            appState.toggleInterest(for: item) { _ in }
                        } label: {
                            let on = appState.interestedAssetIds.contains(item.assetId)
                            Label(on ? "Uninterested" : "Interested",
                                  systemImage: on ? "star.slash" : "star")
                        }
                        .tint(Color.iffAccent)
                    }
                }
                .listRowBackground(Color.iffSurface)
                .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 16))
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Color.iffBg)
    }
}

// MARK: - Roster Detail (pushed from DashboardView team grid)

struct RosterDetailView: View {
    @EnvironmentObject var appState: AppState
    let teamName: String

    private var assets: [DisplayAsset] {
        appState.allDisplayAssets.filter { $0.teamName == teamName }
            .sorted { $0.currentPrice > $1.currentPrice }
    }

    var body: some View {
        ZStack {
            Color.iffBg.ignoresSafeArea()
            List {
                ForEach(assets) { item in
                    NavigationLink(destination: AssetDetailView(asset: item)) {
                        AssetRow(item: item, activeSeason: appState.activeSeason)
                    }
                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                        if item.teamName != appState.userTeam {
                            Button {
                                appState.toggleInterest(for: item) { _ in }
                            } label: {
                                let on = appState.interestedAssetIds.contains(item.assetId)
                                Label(on ? "Uninterested" : "Interested",
                                      systemImage: on ? "star.slash" : "star")
                            }
                            .tint(Color.iffAccent)
                        }
                    }
                    .listRowBackground(Color.iffSurface)
                    .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 16))
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
        }
        .navigationTitle(teamName)
        .navigationBarTitleDisplayMode(.inline)
    }
}
