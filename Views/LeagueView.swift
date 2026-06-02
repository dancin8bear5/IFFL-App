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
                Color.iffBg.ignoresSafeArea()
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
                            .foregroundColor(Color.iffSubtext)
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
        .background(Color.iffBg)
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

        case .standings, .scores:
            if appState.isOffSeason {
                offSeasonOverlay
            } else {
                ZStack {
                    if let url = activeTab.url {
                        if !loadFailed {
                            WebViewContainer(url: url, isLoading: $isLoading, loadFailed: $loadFailed)
                        }
                        if isLoading && !loadFailed {
                            Color.iffBg
                            ProgressView().tint(Color.iffAccent).scaleEffect(1.4)
                        }
                        if loadFailed {
                            VStack(spacing: 16) {
                                Image(systemName: "wifi.slash")
                                    .font(.system(size: 44))
                                    .foregroundColor(Color.iffSubtext)
                                Text("Couldn't load page")
                                    .font(.headline).foregroundColor(.white)
                                Button {
                                    loadFailed = false
                                    isLoading  = true
                                } label: {
                                    Text("Retry")
                                }
                                .buttonStyle(IFFLPrimaryButtonStyle())
                            }
                        }
                    }
                }
            }
        }
    }

    private var offSeasonOverlay: some View {
        VStack(spacing: 20) {
            Spacer()
            Image(systemName: "snowflake")
                .font(.system(size: 56))
                .foregroundColor(Color.iffAccent)
            Text("Off-Season")
                .font(.system(size: 28, weight: .bold))
                .foregroundColor(.white)
            Text("The \(appState.activeSeason) season has concluded.\nCheck the History tab to relive past glory.")
                .font(.subheadline)
                .foregroundColor(Color.iffSubtext)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            Spacer()
        }
    }
}
