import SwiftUI

// MARK: - League Milestones (update dates each season)

private struct BeltMilestone {
    let name: String
    let icon: String
    let color: Color
    let date: Date

    static func make(_ month: Int, _ day: Int, _ year: Int = 2026) -> Date {
        Calendar.current.date(from: DateComponents(year: year, month: month, day: day)) ?? Date()
    }

    static let all: [BeltMilestone] = [
        BeltMilestone(name: "Rookie Draft",         icon: "graduationcap.fill",      color: .purple,       date: make(6, 21)),
        BeltMilestone(name: "Keeper Declaration",   icon: "person.badge.clock.fill", color: .cyan,         date: make(7, 15)),
        BeltMilestone(name: "Auction Draft",        icon: "dollarsign.circle.fill",  color: Color.beltGold, date: make(8, 22)),
        BeltMilestone(name: "NFL Kickoff",          icon: "football.fill",           color: .green,        date: make(9, 10)),
        BeltMilestone(name: "Trade Deadline",       icon: "arrow.2.squarepath",      color: .orange,       date: make(11, 4)),
        BeltMilestone(name: "Playoffs",             icon: "trophy.fill",             color: Color.beltAccent, date: make(12, 10)),
    ]
}

// MARK: - Dashboard View

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

    private var myCapTotal: Int { myAssets.map { $0.currentPrice }.reduce(0, +) }

    private var myTeamInfo: FantasyTeam? { fantasyTeams.first { $0.name == appState.userTeam } }

    private var recentTrades: [Trade] {
        Array(appState.trades
            .filter { $0.status == .completed || $0.status == .historical }
            .sorted { $0.date > $1.date }
            .prefix(5))
    }

    private var upcomingMilestones: [BeltMilestone] {
        let now = Date()
        return BeltMilestone.all.filter { $0.date > now }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Color.beltBg.ignoresSafeArea()
                ScrollView {
                    VStack(spacing: 20) {
                        header
                        if appState.isInitialLoadComplete {
                            myTeamCard
                                .transition(.opacity.combined(with: .move(edge: .top)))
                            trophyRoomLink
                            if appState.myMatchCount > 0 { matchNotificationCard }
                            if !upcomingMilestones.isEmpty { keeperCalendarSection }
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
                            .foregroundColor(Color.beltSubtext)
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
            Text("The Belt")
                .font(.system(size: 56, weight: .black, design: .rounded))
                .foregroundColor(Color.beltAccent)
            Text("Fantasy Football League")
                .font(.caption).foregroundColor(Color.beltSubtext)
            Text("EST. 2008")
                .font(.system(size: 9, weight: .semibold))
                .foregroundColor(Color.beltSubtext.opacity(0.5))
                .tracking(4)
        }
        .padding(.top, 16)
    }

    // MARK: Trophy Room

    private var trophyRoomLink: some View {
        NavigationLink {
            TrophyCaseView().environmentObject(appState)
        } label: {
            HStack(spacing: 14) {
                ZStack {
                    Circle().fill(Color.iffGold.opacity(0.18)).frame(width: 44, height: 44)
                    Image(systemName: "trophy.fill")
                        .font(.system(size: 20)).foregroundColor(Color.iffGold)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text("League Trophy Room")
                        .font(.headline).foregroundColor(.white)
                    Text("Career stats, belts & finishes for every team")
                        .font(.caption).foregroundColor(Color.iffSubtext)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption).foregroundColor(Color.iffSubtext)
            }
            .padding()
            .iffCard()
        }
        .buttonStyle(.plain)
    }

    // MARK: My Team Card

    private var myTeamCard: some View {
        let belts = myTeamInfo?.beltWins ?? 0
        return VStack(alignment: .leading, spacing: 0) {

            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("My Team").font(.caption).foregroundColor(Color.beltSubtext)
                    HStack(spacing: 8) {
                        Text(appState.userTeam)
                            .font(.system(size: 24, weight: .black)).foregroundColor(.white)
                        if belts > 0 {
                            HStack(spacing: 2) {
                                ForEach(0..<belts, id: \.self) { _ in
                                    Image(systemName: "trophy.fill")
                                        .font(.system(size: 10)).foregroundColor(Color.beltGold)
                                }
                            }
                        }
                    }
                    if belts > 0 {
                        Text("\(belts)× League Champion")
                            .font(.caption2).foregroundColor(Color.beltGold.opacity(0.8))
                    }
                }
                Spacer()
                if let logoName = appState.userSettings.teamLogoName {
                    Image(systemName: logoName)
                        .font(.system(size: 32)).foregroundColor(Color.beltAccent.opacity(0.55))
                }
            }
            .padding([.horizontal, .top], 16)
            .padding(.bottom, 12)

            Divider().background(Color.beltElevated).padding(.horizontal)

            HStack(spacing: 0) {
                statCell(value: "$\(myCapTotal)", label: String(appState.activeSeason) + " Cap")
                Divider().frame(height: 32).background(Color.beltElevated)
                statCell(value: "\(appState.myMatchCount)", label: "Trade Matches")
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)

            if !myTopAssets.isEmpty {
                Divider().background(Color.beltElevated).padding(.horizontal)
                VStack(alignment: .leading, spacing: 7) {
                    Text("Top Players")
                        .font(.caption.bold()).foregroundColor(Color.beltSubtext)
                    ForEach(myTopAssets) { asset in
                        HStack(spacing: 8) {
                            Text(asset.position)
                                .font(.caption2.bold()).foregroundColor(Color.beltAccent)
                                .frame(width: 28, alignment: .leading)
                            Text(asset.name)
                                .font(.subheadline).foregroundColor(.white).lineLimit(1)
                            Spacer()
                            Text("$\(asset.currentPrice)")
                                .font(.subheadline.bold()).foregroundColor(.green)
                        }
                    }
                }
                .padding(.horizontal)
                .padding(.vertical, 10)
            }

            Divider().background(Color.beltElevated).padding(.horizontal)

            HStack(spacing: 12) {
                Button { selectedTab = 1 } label: {
                    Label("Roster", systemImage: "person.3.fill")
                        .font(.caption.bold()).frame(maxWidth: .infinity)
                }
                .buttonStyle(BeltOutlineButtonStyle())

                Button { selectedTab = 2 } label: {
                    Label("Market", systemImage: "arrow.2.squarepath")
                        .font(.caption.bold()).frame(maxWidth: .infinity)
                }
                .buttonStyle(BeltOutlineButtonStyle())
            }
            .padding()
        }
        .beltCard()
    }

    private func statCell(value: String, label: String) -> some View {
        VStack(spacing: 2) {
            Text(value).font(.system(size: 17, weight: .bold)).foregroundColor(Color.beltGold)
            Text(label).font(.caption2).foregroundColor(Color.beltSubtext)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: Match Notification

    private var matchNotificationCard: some View {
        Button { selectedTab = 2 } label: {
            HStack(spacing: 12) {
                ZStack {
                    Circle().fill(Color.beltAccent.opacity(0.15)).frame(width: 40, height: 40)
                    Image(systemName: "arrow.2.squarepath")
                        .font(.system(size: 17)).foregroundColor(Color.beltAccent)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(appState.myMatchCount) Trade Match\(appState.myMatchCount == 1 ? "" : "es")")
                        .font(.subheadline.bold()).foregroundColor(.white)
                    Text("Mutual trade interest detected")
                        .font(.caption).foregroundColor(Color.beltSubtext)
                }
                Spacer()
                Image(systemName: "chevron.right").font(.caption).foregroundColor(Color.beltSubtext)
            }
            .padding()
            .beltCard()
        }
    }

    // MARK: Keeper Calendar

    private var keeperCalendarSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader("League Calendar", action: nil, actionLabel: nil)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(upcomingMilestones, id: \.name) { milestone in
                        MilestoneCard(milestone: milestone)
                    }
                }
                .padding(.horizontal, 2)
                .padding(.vertical, 2)
            }
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
                                .font(.caption).foregroundColor(Color.beltSubtext).lineLimit(1)
                        }
                        Spacer()
                        Text(trade.formattedDate).font(.caption).foregroundColor(Color.beltSubtext)
                    }
                    .padding()
                    .beltCard()
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
                            .beltCard()
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
                    Text(actionLabel).font(.caption.bold()).foregroundColor(Color.beltAccent)
                }
            }
        }
    }
}

// MARK: - Milestone Card

private struct MilestoneCard: View {
    let milestone: BeltMilestone

    private var daysUntil: Int {
        Calendar.current.dateComponents([.day], from: Calendar.current.startOfDay(for: Date()),
                                        to: Calendar.current.startOfDay(for: milestone.date)).day ?? 0
    }

    private var monthStr: String {
        let fmt = DateFormatter(); fmt.dateFormat = "MMM"
        return fmt.string(from: milestone.date).uppercased()
    }

    private var dayStr: String {
        let fmt = DateFormatter(); fmt.dateFormat = "d"
        return fmt.string(from: milestone.date)
    }

    private var daysLabel: String {
        switch daysUntil {
        case 0:  return "Today"
        case 1:  return "Tomorrow"
        default: return "\(daysUntil) days"
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            // Color accent bar
            Rectangle()
                .fill(milestone.color)
                .frame(height: 4)
                .clipShape(RoundedCorner(radius: 12, corners: [.topLeft, .topRight]))

            VStack(spacing: 8) {
                // Icon
                ZStack {
                    Circle()
                        .fill(milestone.color.opacity(0.15))
                        .frame(width: 38, height: 38)
                    Image(systemName: milestone.icon)
                        .font(.system(size: 16))
                        .foregroundColor(milestone.color)
                }

                // Date
                VStack(spacing: 1) {
                    Text(monthStr)
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(milestone.color)
                    Text(dayStr)
                        .font(.system(size: 28, weight: .black))
                        .foregroundColor(.white)
                }

                // Name
                Text(milestone.name)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(.white)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)

                // Days away
                Text(daysLabel)
                    .font(.system(size: 10))
                    .foregroundColor(milestone.color.opacity(0.85))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(milestone.color.opacity(0.12))
                    .clipShape(Capsule())
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 12)
        }
        .frame(width: 110)
        .background(Color.beltSurface)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .shadow(color: milestone.color.opacity(0.2), radius: 8, y: 4)
    }
}

// MARK: - Rounded Corner Helper

private struct RoundedCorner: Shape {
    var radius: CGFloat
    var corners: UIRectCorner

    func path(in rect: CGRect) -> Path {
        let path = UIBezierPath(roundedRect: rect, byRoundingCorners: corners,
                                cornerRadii: CGSize(width: radius, height: radius))
        return Path(path.cgPath)
    }
}
