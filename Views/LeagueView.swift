import SwiftUI

struct LeagueView: View {
    @State private var activeTab: LeagueTab = .standings
    @State private var isLoading  = true
    @State private var loadFailed = false

    enum LeagueTab: String, CaseIterable {
        case standings = "Standings"
        case scores    = "Scores"

        var url: URL {
            switch self {
            case .standings: return URL(string: "https://www.insanityleague.com/standings")!
            case .scores:    return URL(string: "https://www.insanityleague.com/scores")!
            }
        }

        var icon: String {
            switch self {
            case .standings: return "list.number"
            case .scores:    return "sportscourt.fill"
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
        ZStack {
            if !loadFailed {
                WebViewContainer(url: activeTab.url, isLoading: $isLoading, loadFailed: $loadFailed)
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
