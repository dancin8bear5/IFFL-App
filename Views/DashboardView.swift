import SwiftUI

struct DashboardView: View {
    @Binding var selectedTab: Int
    @EnvironmentObject var appState: AppState
    @State private var showSettings = false

    private var myAssets: [DisplayAsset] {
        appState.allDisplayAssets.filter { $0.teamName == appState.userTeam }
    }

    private var myTopAssets: [DisplayAsset] {
        Array(myAssets.filter { !$0.isPick }.sorted { $0.currentPrice > $1.currentPrice }.prefix(3))
    }

    private var capRankings: [(team: String, cap: Int)] {
        let grouped = Dictionary(grouping: appState.allDisplayAssets, by: { $0.teamName })
        return grouped.map { (team: $0.key, cap: $0.value.map { $0.currentPrice }.reduce(0, +)) }
            .sorted { $0.cap > $1.cap }
    }

    private var myCapRank: Int {
        (capRankings.firstIndex(where: { $0.team == appState.userTeam }) ?? 0) + 1
    }

    private var myCapTotal: Int {
        myAssets.map { $0.currentPrice }.reduce(0, +)
    }

    private var myTeamInfo: FantasyTeam? {
        fantasyTeams.first { $0.name == appState.userTeam }
    }

    private var recentTrades: [Trade] {
        Array(appState.trades
            .filter { $0.status == .completed || $0.status == .historical }
            .sorted { $0.date > $1.date }
            .prefix(5))
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Color.iffBg.ignoresSafeArea()
                ScrollView {
                    VStack(spacing: 20) {
                        header
                        if appState.isInitialLoadComplete {
                            myTeamCard
                                .transition(.opacity.combined(with: .move(edge: .top)))
                            if appState.myMatchCount > 0 { matchNotificationCard }
                            leagueCapRankingsSection
                            teamGridSection
                            if !recentTrades.isEmpty { recentTradesSection }
                            if !appState.messages.isEmpty { messagesSection }
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
                .font(.caption).foregroundColor(Color.iffSubtext)
            Text("EST. 2008")
                .font(.system(size: 9, weight: .semibold))
                .foregroundColor(Color.iffSubtext.opacity(0.5))
                .tracking(4)
        }
        .padding(.top, 16)
    }

    // MARK: My Team Card

    private var myTeamCard: some View {
        let belts = myTeamInfo?.beltWins ?? 0
        return VStack(alignment: .leading, spacing: 0) {

            // Identity
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("My Team").font(.caption).foregroundColor(Color.iffSubtext)
                    HStack(spacing: 8) {
                        Text(appState.userTeam)
                            .font(.system(size: 24, weight: .black)).foregroundColor(.white)
                        if belts > 0 {
                            HStack(spacing: 2) {
                                ForEach(0..<belts, id: \.self) { _ in
                                    Image(systemName: "trophy.fill")
                                        .font(.system(size: 10)).foregroundColor(Color.iffGold)
                                }
                            }
                        }
                    }
                    if belts > 0 {
                        Text("\(belts)× League Champion")
                            .font(.caption2).foregroundColor(Color.iffGold.opacity(0.8))
                    }
                }
                Spacer()
                if let logoName = appState.userSettings.teamLogoName {
                    Image(systemName: logoName)
                        .font(.system(size: 32)).foregroundColor(Color.iffAccent.opacity(0.55))
                }
            }
            .padding([.horizontal, .top], 16)
            .padding(.bottom, 12)

            Divider().background(Color.iffElevated).padding(.horizontal)

            // Stats row
            HStack(spacing: 0) {
                statCell(value: "#\(myCapRank) of 12", label: "Cap Rank")
                Divider().frame(height: 32).background(Color.iffElevated)
                statCell(value: "$\(myCapTotal)", label: String(appState.activeSeason) + " Cap")
                Divider().frame(height: 32).background(Color.iffElevated)
                statCell(value: "\(appState.myMatchCount)", label: "Matches")
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)

            // Top players
            if !myTopAssets.isEmpty {
                Divider().background(Color.iffElevated).padding(.horizontal)
                VStack(alignment: .leading, spacing: 7) {
                    Text("Top Players")
                        .font(.caption.bold()).foregroundColor(Color.iffSubtext)
                    ForEach(myTopAssets) { asset in
                        HStack(spacing: 8) {
                            Text(asset.position)
                                .font(.caption2.bold()).foregroundColor(Color.iffAccent)
                                .frame(width: 28, alignment: .leading)
                            Text(asset.name)
                                .font(.subheadline).foregroundColor(.white)
                                .lineLimit(1)
                            Spacer()
                            Text("$\(asset.currentPrice)")
                                .font(.subheadline.bold()).foregroundColor(.green)
                        }
                    }
                }
                .padding(.horizontal)
                .padding(.vertical, 10)
            }

            Divider().background(Color.iffElevated).padding(.horizontal)

            // Actions
            HStack(spacing: 12) {
                Button { selectedTab = 1 } label: {
                    Label("Roster", systemImage: "person.3.fill")
                        .font(.caption.bold()).frame(maxWidth: .infinity)
                }
                .buttonStyle(IFFLOutlineButtonStyle())

                Button { selectedTab = 2 } label: {
                    Label("Market", systemImage: "arrow.2.squarepath")
                        .font(.caption.bold()).frame(maxWidth: .infinity)
                }
                .buttonStyle(IFFLOutlineButtonStyle())
            }
            .padding()
        }
        .iffCard()
    }

    private func statCell(value: String, label: String) -> some View {
        VStack(spacing: 2) {
            Text(value).font(.system(size: 15, weight: .bold)).foregroundColor(Color.iffGold)
            Text(label).font(.caption2).foregroundColor(Color.iffSubtext)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: Match Notification Card

    private var matchNotificationCard: some View {
        Button { selectedTab = 2 } label: {
            HStack(spacing: 12) {
                ZStack {
                    Circle().fill(Color.iffAccent.opacity(0.15)).frame(width: 40, height: 40)
                    Image(systemName: "arrow.2.squarepath")
                        .font(.system(size: 17)).foregroundColor(Color.iffAccent)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(appState.myMatchCount) Trade Match\(appState.myMatchCount == 1 ? "" : "es")")
                        .font(.subheadline.bold()).foregroundColor(.white)
                    Text("Mutual trade interest detected")
                        .font(.caption).foregroundColor(Color.iffSubtext)
                }
                Spacer()
                Image(systemName: "chevron.right").font(.caption).foregroundColor(Color.iffSubtext)
            }
            .padding()
            .iffCard()
        }
    }

    // MARK: League Cap Rankings

    private var leagueCapRankingsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader("League Cap Rankings", action: { selectedTab = 1 }, actionLabel: "Rosters")
            VStack(spacing: 0) {
                ForEach(Array(capRankings.enumerated()), id: \.element.team) { idx, entry in
                    let isMe = entry.team == appState.userTeam
                    NavigationLink(destination: RosterDetailView(teamName: entry.team)) {
                        HStack(spacing: 12) {
                            Text("\(idx + 1)")
                                .font(.system(size: 13, weight: .bold))
                                .foregroundColor(idx < 3 ? Color.iffGold : Color.iffSubtext)
                                .frame(width: 22, alignment: .center)
                            Image(entry.team)
                                .resizable().scaledToFill()
                                .frame(width: 28, height: 28).clipShape(Circle())
                            Text(entry.team)
                                .font(.subheadline)
                                .foregroundColor(isMe ? Color.iffAccent : .white)
                                .fontWeight(isMe ? .bold : .regular)
                            if isMe {
                                Image(systemName: "chevron.left")
                                    .font(.system(size: 9, weight: .bold))
                                    .foregroundColor(Color.iffAccent)
                            }
                            Spacer()
                            Text("$\(entry.cap)")
                                .font(.subheadline.monospacedDigit())
                                .foregroundColor(isMe ? Color.iffAccent : Color.iffSubtext)
                                .fontWeight(isMe ? .bold : .regular)
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 9)
                        .background(isMe ? Color.iffAccent.opacity(0.08) : Color.clear)
                    }
                    if idx < capRankings.count - 1 {
                        Divider().background(Color.iffElevated).padding(.leading, 46)
                    }
                }
            }
            .iffCard()
        }
    }

    // MARK: Team Grid

    private var teamGridSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader("All Teams", action: nil, actionLabel: nil)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 88))], spacing: 10) {
                ForEach(fantasyTeams, id: \.name) { team in
                    NavigationLink(destination: RosterDetailView(teamName: team.name)) {
                        TeamIconView(team: team)
                    }
                }
            }
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

    // MARK: Helpers

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
