import SwiftUI

// MARK: - RostersView (top-level tab)

struct RostersView: View {
    @State private var mode: RosterMode = .teams
    @State private var showSettings = false
    @EnvironmentObject var appState: AppState

    enum RosterMode: String, CaseIterable {
        case teams = "By Team"
        case all   = "All Assets"
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Color.beltBg.ignoresSafeArea()
                VStack(spacing: 0) {
                    Picker("Mode", selection: $mode) {
                        ForEach(RosterMode.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .padding()
                    .background(Color.beltBg)

                    if mode == .teams {
                        TeamRosterView()
                    } else {
                        AllAssetsView()
                    }
                }
            }
            .navigationTitle("Rosters")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button { showSettings = true } label: {
                        Image(systemName: "gearshape.fill")
                            .foregroundColor(Color.beltSubtext)
                    }
                }
            }
            .sheet(isPresented: $showSettings) {
                SettingsView().environmentObject(appState)
            }
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
            TeamSwitcherView(selectedTeam: $appState.selectedTeam)

            if !appState.isInitialLoadComplete {
                LoadingView()
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
                                .tint(Color.beltAccent)
                            }
                        }
                        .listRowBackground(Color.beltSurface)
                        .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 16))
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
                .background(Color.beltBg)
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
            Image(systemName: "magnifyingglass").foregroundColor(Color.beltSubtext)
            TextField("Search players & picks…", text: $searchText)
                .foregroundColor(.white)
                .autocapitalization(.none)
            if !searchText.isEmpty {
                Button { searchText = "" } label: {
                    Image(systemName: "xmark.circle.fill").foregroundColor(Color.beltSubtext)
                }
            }
        }
        .padding(10)
        .background(Color.beltSurface)
        .cornerRadius(10)
        .padding(.horizontal)
        .padding(.vertical, 8)
        .background(Color.beltBg)
    }

    private var filterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(allPositions, id: \.self) { pos in
                    positionChip(pos)
                }
                Divider().frame(height: 20).background(Color.beltSubtext.opacity(0.3))
                Button {
                    sortDesc.toggle()
                } label: {
                    Label(sortDesc ? "↓ Price" : "↑ Price", systemImage: "arrow.up.arrow.down")
                        .font(.caption.bold())
                        .foregroundColor(Color.beltAccent)
                        .padding(.horizontal, 10).padding(.vertical, 6)
                        .background(Color.beltSurface)
                        .clipShape(Capsule())
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 6)
        }
        .background(Color.beltBg)
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
                .foregroundColor(selected ? .white : Color.beltSubtext)
                .padding(.horizontal, 10).padding(.vertical, 6)
                .background(selected ? Color.beltAccent : Color.beltSurface)
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
                        .tint(Color.beltAccent)
                    }
                }
                .listRowBackground(Color.beltSurface)
                .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 16))
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Color.beltBg)
    }
}

// MARK: - Team Switcher Chip Row

struct TeamSwitcherView: View {
    @Binding var selectedTeam: String

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(fantasyTeams, id: \.name) { team in
                    TeamChip(teamName: team.name, isSelected: selectedTeam == team.name) {
                        selectedTeam = team.name
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    }
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
        }
        .background(Color.beltSurface)
    }
}

struct TeamChip: View {
    let teamName: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 5) {
                Image(teamName)
                    .resizable()
                    .scaledToFill()
                    .frame(width: 20, height: 20)
                    .clipShape(Circle())
                Text(teamName)
                    .font(.caption.bold())
                    .lineLimit(1)
            }
            .foregroundColor(isSelected ? .white : Color.beltSubtext)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(isSelected ? Color.beltAccent : Color.beltElevated)
            .clipShape(Capsule())
        }
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
            Color.beltBg.ignoresSafeArea()
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
                            .tint(Color.beltAccent)
                        }
                    }
                    .listRowBackground(Color.beltSurface)
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
