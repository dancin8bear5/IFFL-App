import SwiftUI

struct DashboardView: View {
    @Binding var selectedTab: Int
    @EnvironmentObject var appState: AppState

    private var myAssets: [DisplayAsset] {
        appState.allDisplayAssets.filter { $0.teamName == appState.userTeam }
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
                    VStack(spacing: 24) {
                        header
                        myTeamCard
                        if !recentTrades.isEmpty { recentTradesSection }
                        if !appState.messages.isEmpty { messagesSection }
                        teamGridSection
                    }
                    .padding(.horizontal)
                    .padding(.bottom, 100)
                }
            }
            .navigationBarHidden(true)
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

    // MARK: My Team Card

    private var myTeamCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text("My Team").font(.caption).foregroundColor(Color.iffSubtext)
                    Text(appState.userTeam)
                        .font(.system(size: 22, weight: .bold)).foregroundColor(.white)
                }
                Spacer()
                Button { selectedTab = 1 } label: {
                    Text("View Roster").font(.caption.bold())
                }
                .buttonStyle(IFFLOutlineButtonStyle())
            }

            HStack(spacing: 0) {
                statCell(value: "\(myAssets.filter { !$0.isPick }.count)", label: "Players")
                Divider().frame(height: 32).background(Color.iffElevated)
                statCell(value: "\(myAssets.filter { $0.isPick }.count)", label: "Picks")
                Divider().frame(height: 32).background(Color.iffElevated)
                statCell(value: "$\(myAssets.map { $0.currentPrice }.reduce(0, +))",
                         label: "\(appState.activeSeason) Cap")
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .background(Color.iffElevated)
            .cornerRadius(10)
        }
        .padding()
        .iffCard()
    }

    private func statCell(value: String, label: String) -> some View {
        VStack(spacing: 2) {
            Text(value).font(.system(size: 18, weight: .bold)).foregroundColor(Color.iffGold)
            Text(label).font(.caption2).foregroundColor(Color.iffSubtext)
        }
        .frame(maxWidth: .infinity)
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
