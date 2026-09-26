import SwiftUI

struct LeagueView: View {
    @EnvironmentObject var appState: AppState
    @State private var activeTab: LeagueTab = .standings
    @State private var isLoading  = true
    @State private var loadFailed = false
    @State private var showSettings = false

    enum LeagueTab: String, CaseIterable {
        case standings = "Standings"
        case scores    = "Scores"
        case history   = "History"

        var url: URL? {
            switch self {
            case .standings: return URL(string: "https://www.insanityleague.com/standings")
            case .scores:    return URL(string: "https://www.insanityleague.com/scores")
            case .history:   return nil
            }
        }

        var icon: String {
            switch self {
            case .standings: return "list.number"
            case .scores:    return "sportscourt.fill"
            case .history:   return "clock.arrow.circlepath"
            }
        }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Color.beltBg.ignoresSafeArea()
                VStack(spacing: 0) {
                    tabPicker
                    webContent
                }
            }
            .navigationTitle("League")
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

    private var tabPicker: some View {
        Picker("League Tab", selection: $activeTab) {
            ForEach(LeagueTab.allCases, id: \.self) {
                Label($0.rawValue, systemImage: $0.icon).tag($0)
            }
        }
        .pickerStyle(.segmented)
        .padding()
        .background(Color.beltBg)
        .onChange(of: activeTab) { _ in
            isLoading = true
            loadFailed = false
        }
    }

    @ViewBuilder
    private var webContent: some View {
        switch activeTab {
        case .history:
            LeagueHistoryView()

        case .standings:
            LocalStandingsView(history: appState.leagueHistory)
                .onAppear { appState.loadLeagueHistory() }

        case .scores:
            seasonOverView
        }
    }

    private var seasonOverView: some View {
        VStack(spacing: 20) {
            Spacer()
            Image(systemName: "flag.checkered")
                .font(.system(size: 56))
                .foregroundColor(Color.beltAccent)
            Text("Season Over")
                .font(.system(size: 28, weight: .bold))
                .foregroundColor(.white)
            Text("The " + String(appState.activeSeason - 1) + " season has concluded.\nScores will return in the fall.")
                .font(.subheadline)
                .foregroundColor(Color.beltSubtext)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            Spacer()
        }
    }

    @ViewBuilder
    private func webLoadView(url: URL?) -> some View {
        ZStack {
            if let url {
                if !loadFailed {
                    WebViewContainer(url: url, isLoading: $isLoading, loadFailed: $loadFailed)
                }
                if isLoading && !loadFailed {
                    Color.beltBg
                    ProgressView().tint(Color.beltAccent).scaleEffect(1.4)
                }
                if loadFailed {
                    VStack(spacing: 16) {
                        Image(systemName: "wifi.slash")
                            .font(.system(size: 44))
                            .foregroundColor(Color.beltSubtext)
                        Text("Couldn't load page")
                            .font(.headline).foregroundColor(.white)
                        Button {
                            loadFailed = false
                            isLoading  = true
                        } label: {
                            Text("Retry")
                        }
                        .buttonStyle(BeltPrimaryButtonStyle())
                    }
                }
            }
        }
    }
}

// MARK: - Local Standings View

struct LocalStandingsView: View {
    let history: [SeasonHistory]

    private var latestSeason: SeasonHistory? {
        history.sorted { $0.season > $1.season }.first
    }

    var body: some View {
        if let season = latestSeason {
            ScrollView {
                VStack(spacing: 0) {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(String(season.season) + " Final Standings")
                                .font(.headline).foregroundColor(.white)
                            HStack(spacing: 4) {
                                Text("🏆").font(.caption)
                                Text(season.champion)
                                    .font(.caption.bold()).foregroundColor(Color.beltGold)
                            }
                        }
                        Spacer()
                    }
                    .padding()

                    Divider().background(Color.beltElevated)

                    ForEach(season.standings.sorted { $0.place < $1.place }, id: \.teamName) { finish in
                        HStack(spacing: 12) {
                            Text("\(finish.place)")
                                .font(.system(size: 15, weight: .bold))
                                .foregroundColor(finish.place <= 3 ? Color.beltGold : Color.beltSubtext)
                                .frame(width: 26, alignment: .center)
                            Text(finish.teamName)
                                .font(.subheadline).foregroundColor(.white)
                            Spacer()
                            if let record = finish.record {
                                Text(record)
                                    .font(.subheadline.monospacedDigit()).foregroundColor(Color.beltSubtext)
                            }
                            if let pts = finish.pointsFor {
                                Text(String(format: "%.0f pts", pts))
                                    .font(.caption).foregroundColor(Color.beltSubtext)
                                    .frame(width: 56, alignment: .trailing)
                            }
                        }
                        .padding(.horizontal)
                        .padding(.vertical, 10)
                        .background(finish.place % 2 == 0 ? Color.beltElevated.opacity(0.3) : Color.clear)
                    }
                }
                .beltCard()
                .padding()
            }
        } else {
            VStack(spacing: 16) {
                Spacer()
                Image(systemName: "list.number")
                    .font(.system(size: 48)).foregroundColor(Color.beltSubtext)
                Text("No standings data")
                    .font(.headline).foregroundColor(Color.beltSubtext)
                Text("Seed league history from the Admin panel.")
                    .font(.caption).foregroundColor(Color.beltSubtext.opacity(0.7))
                Spacer()
            }
        }
    }
}
