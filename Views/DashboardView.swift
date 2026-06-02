import SwiftUI

struct DashboardView: View {
    @Binding var selectedTab: Int
    @EnvironmentObject var appState: AppState
    @State private var showSettings = false

    private var myAssets: [DisplayAsset] {
        appState.allDisplayAssets.filter { $0.teamName == appState.userTeam }
    }

    private var recentTrades: [Trade] {
        Array(appState.trades
            .filter { $0.status == .completed || $0.status == .historical }
            .sorted { $0.date > $1.date }
            .prefix(5))
    }

    private var myTeamInfo: FantasyTeam? {
        fantasyTeams.first { $0.name == appState.userTeam }
    }

    private var myMatchCount: Int { appState.myMatchCount }

    var body: some View {
        NavigationStack {
            ZStack {
                Color.iffBg.ignoresSafeArea()
                ScrollView {
                    VStack(spacing: 24) {
                        header
                        if appState.isInitialLoadComplete {
                            myTeamCard
                                .transition(.opacity.combined(with: .move(edge: .top)))
                            if myMatchCount > 0 { matchNotificationCard }
                            if !recentTrades.isEmpty { recentTradesSection }
                            if !appState.messages.isEmpty { messagesSection }
                            teamGridSection
                        } else {
                            LoadingView(count: 4).padding(.top, 12)
                        }
                    }
                    .padding(.horizontal)
                    .padding(.bottom, 100)
                    .animation(.spring(response: 0.45, dampingFraction: 0.78), value: appState.isInitialLoadComplete)
                }
                .overlay(alignment: .topTrailing) {
                    Button { showSettings = true } label: {
                        Image(systemName: "gearshape.fill")
                            .foregroundColor(Color.iffSubtext)
                            .font(.body)
                            .padding(16)
                    }
                }
            }
            .navigationBarHidden(true)
            .sheet(isPresented: $showSettings) {
                SettingsView().environmentObject(appState)
            }
        }
    }

    // MARK: Header

    private var header: some View {
        VStack(spacing: 6) {
            Text("IFFL")
                .font(.system(size: 56, weight: .black, design: .rounded))
                .foregroundColor(Color.iffAccent)
            Text("Insanity Fantasy Football League")
                .font(.caption)
                .foregroundColor(Color.iffSubtext)
            Text("EST. 2008")
                .font(.system(size: 9, weight: .semibold))
                .foregroundColor(Color.iffSubtext.opacity(0.5))
                .tracking(4)
        }
        .padding(.top, 16)
    }

    // MARK: My Team Card (redesigned)

    private var myTeamCard: some View {
        let capTotal = myAssets.map { $0.currentPrice }.reduce(0, +)
        let belts = myTeamInfo?.beltWins ?? 0

        return VStack(alignment: .leading, spacing: 0) {
            // Team identity row
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("My Team")
                        .font(.caption).foregroundColor(Color.iffSubtext)
                    HStack(alignment: .center, spacing: 8) {
                        Text(appState.userTeam)
                            .font(.system(size: 26, weight: .black))
                            .foregroundColor(.white)
                        if belts > 0 {
                            HStack(spacing: 2) {
                                ForEach(0..<belts, id: \.self) { _ in
                                    Image(systemName: "crown.fill")
                                        .font(.system(size: 10))
                                        .foregroundColor(Color.iffGold)
                                }
                            }
                        }
                    }
                    if belts > 0 {
                        Text("\(belts)× League Champion")
                            .font(.caption2)
                            .foregroundColor(Color.iffGold.opacity(0.8))
                    }
                }
                Spacer()
                if let logoName = appState.userSettings.teamLogoName {
                    Image(systemName: logoName)
                        .font(.system(size: 32))
                        .foregroundColor(Color.iffAccent.opacity(0.7))
                }
            }
            .padding(.horizontal)
            .padding(.top, 16)
            .padding(.bottom, 12)

            Divider().background(Color.iffElevated).padding(.horizontal)

            // Cap total — center stage
            VStack(spacing: 4) {
                Text("$\(capTotal)")
                    .font(.system(size: 42, weight: .black, design: .rounded))
                    .foregroundColor(Color.iffGold)
                Text(String(appState.activeSeason) + " Salary Cap")
                    .font(.caption)
                    .foregroundColor(Color.iffSubtext)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 18)

            Divider().background(Color.iffElevated).padding(.horizontal)

            // Action buttons
            HStack(spacing: 12) {
                Button { selectedTab = 1 } label: {
                    Label("Roster", systemImage: "person.3.fill")
                        .font(.caption.bold())
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(IFFLOutlineButtonStyle())

                Button { selectedTab = 2 } label: {
                    Label("Market", systemImage: "arrow.2.squarepath")
                        .font(.caption.bold())
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(IFFLOutlineButtonStyle())
            }
            .padding()
        }
        .iffCard()
    }

    // MARK: Match Notification Card

    private var matchNotificationCard: some View {
        Button { selectedTab = 2 } label: {
            HStack(spacing: 12) {
                ZStack {
                    Circle()
                        .fill(Color.iffAccent.opacity(0.15))
                        .frame(width: 40, height: 40)
                    Image(systemName: "arrow.2.squarepath")
                        .font(.system(size: 17))
                        .foregroundColor(Color.iffAccent)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(myMatchCount) Trade Match\(myMatchCount == 1 ? "" : "es")")
                        .font(.subheadline.bold()).foregroundColor(.white)
                    Text("Mutual trade interest detected")
                        .font(.caption).foregroundColor(Color.iffSubtext)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundColor(Color.iffSubtext)
            }
            .padding()
            .iffCard()
        }
    }

    // MARK: Recent Trades

    private var recentTradesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader("Recent Trades", action: { selectedTab = 2 }, actionLabel: "See All")
            ForEach(recentTrades) { trade in
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

    // MARK: Messages

    private var messagesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader("League Messages", action: nil, actionLabel: nil)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(appState.messages) { msg in
                        Text(msg.content)
                            .font(.subheadline).foregroundColor(.white)
                            .padding()
                            .frame(width: 260, alignment: .leading)
                            .iffCard()
                    }
                }
            }
        }
    }

    // MARK: Team Grid

    private var teamGridSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader("All Teams", action: { selectedTab = 1 }, actionLabel: "Rosters")
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 88))], spacing: 10) {
                ForEach(fantasyTeams, id: \.name) { team in
                    NavigationLink(destination: RosterDetailView(teamName: team.name)) {
                        TeamIconView(team: team)
                    }
                }
            }
        }
    }

    // MARK: Section Header Helper

    private func sectionHeader(_ title: String, action: (() -> Void)?, actionLabel: String?) -> some View {
        HStack {
            Text(title).font(.headline).foregroundColor(.white)
            Spacer()
            if let action, let actionLabel {
                Button(action: action) {
                    Text(actionLabel).font(.caption.bold()).foregroundColor(Color.iffAccent)
                }
            }
        }
    }
}
