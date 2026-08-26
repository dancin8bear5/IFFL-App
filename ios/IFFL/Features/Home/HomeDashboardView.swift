import SwiftUI

/// First-launch tab. Personal greeting + next-up milestone + your team
/// summary. Built to feel like Apple Sports' home screen but for a private
/// dynasty league.
struct HomeDashboardView: View {
    @State private var nextMilestone: CalendarMilestone?
    @State private var myTeam: LeagueRepository.TeamWithRoster?
    @State private var allTeams: [LeagueRepository.TeamWithRoster] = []
    @State private var isLoading = true
    @State private var error: String?

    @State private var supabase = SupabaseService.shared

    var body: some View {
        NavigationStack {
            ZStack {
                Color.bgPrimary.ignoresSafeArea()
                content
            }
            .navigationTitle("IFFL")
            .navigationBarTitleDisplayMode(.large)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .task { await load() }
            .refreshable { await load() }
        }
    }

    @ViewBuilder
    private var content: some View {
        if isLoading && allTeams.isEmpty {
            ProgressView().controlSize(.large).tint(.textSecondary)
        } else if let error {
            Text(error).foregroundStyle(Theme.Status.over).padding()
        } else {
            ScrollView {
                LazyVStack(spacing: Theme.Spacing.lg) {
                    if let m = nextMilestone {
                        NextMilestoneCard(milestone: m)
                    }
                    if let team = myTeam {
                        YourTeamCard(team: team)
                    }
                    leagueAtAGlance
                    Spacer().frame(height: 96)
                }
                .padding(.horizontal, Theme.Spacing.lg)
                .padding(.top, Theme.Spacing.sm)
            }
        }
    }

    private var leagueAtAGlance: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            Text.eyebrow("League at a glance")
            HStack(spacing: Theme.Spacing.sm) {
                miniStat(value: "\(allTeams.count)", label: "Teams")
                miniStat(
                    value: "\(allTeams.reduce(0) { $0 + $1.rosterCount })",
                    label: "Contracts"
                )
                miniStat(
                    value: "\(allTeams.filter { $0.capSalary > 300 }.count)",
                    label: "Over Cap",
                    color: allTeams.contains { $0.capSalary > 300 } ? Theme.Status.over : Theme.Status.safe
                )
            }
        }
    }

    private func miniStat(value: String, label: String,
                          color: Color = Theme.Text.primary) -> some View {
        VStack(spacing: 4) {
            Text(value)
                .font(AppFont.titleL)
                .tabularNumerals()
                .foregroundStyle(color)
                .contentTransition(.numericText())
            Text(label.uppercased())
                .font(AppFont.eyebrow)
                .tracking(1.0)
                .foregroundStyle(Theme.Text.tertiary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, Theme.Spacing.md)
        .background(
            Theme.BG.card,
            in: RoundedRectangle(cornerRadius: Theme.Radius.medium, style: .continuous)
        )
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.medium, style: .continuous)
                .strokeBorder(.white.opacity(0.04), lineWidth: 0.5)
        )
    }

    private func load() async {
        error = nil
        async let teamsTask  = LeagueRepository.shared.fetchTeamsWithRosters()
        async let nextTask   = LeagueRepository.shared.nextMilestone()
        do {
            let (teams, next) = try await (teamsTask, nextTask)
            self.allTeams = teams
            self.nextMilestone = next
            if let myAuthEmail = supabase.session?.user.email?.lowercased() {
                self.myTeam = teams.first {
                    $0.owner.email.lowercased() == myAuthEmail
                }
            }
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }
}

// MARK: - Next milestone card

private struct NextMilestoneCard: View {
    let milestone: CalendarMilestone

    private var urgencyColor: Color {
        let days = milestone.daysUntil
        if days <= 7 { return Theme.Status.over }
        if days <= 30 { return Theme.Status.warn }
        return Theme.Accent.cool
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.md) {
            HStack(spacing: 6) {
                Circle()
                    .fill(urgencyColor)
                    .frame(width: 8, height: 8)
                    .overlay(
                        Circle().fill(urgencyColor).blur(radius: 4)
                    )
                Text("NEXT UP")
                    .font(AppFont.eyebrow)
                    .tracking(1.4)
                    .foregroundStyle(Theme.Text.secondary)
                Spacer()
                Text(milestone.dueAt, format: .dateTime.month().day().year(.twoDigits))
                    .font(AppFont.caption)
                    .foregroundStyle(Theme.Text.tertiary)
                    .tabularNumerals()
            }

            VStack(alignment: .leading, spacing: 6) {
                Text(milestone.milestone)
                    .font(AppFont.displayM)
                    .foregroundStyle(Theme.Text.primary)
                    .lineLimit(2)
                if let desc = milestone.description, !desc.isEmpty {
                    Text(desc)
                        .font(AppFont.caption)
                        .foregroundStyle(Theme.Text.secondary)
                        .lineLimit(2)
                }
            }

            HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.sm) {
                Text(milestone.countdownLabel.uppercased())
                    .font(.system(size: 28, weight: .heavy, design: .rounded))
                    .foregroundStyle(urgencyColor)
                    .contentTransition(.numericText())
                Spacer()
                NavigationLink {
                    CalendarView()
                } label: {
                    HStack(spacing: 4) {
                        Text("CALENDAR")
                            .font(AppFont.captionStrong)
                            .tracking(0.8)
                        Image(systemName: "chevron.right")
                            .font(.system(size: 10, weight: .heavy))
                    }
                    .foregroundStyle(Theme.Text.secondary)
                }
            }
        }
        .padding(Theme.Spacing.lg)
        .background(
            Theme.BG.card,
            in: RoundedRectangle(cornerRadius: Theme.Radius.large, style: .continuous)
        )
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.large, style: .continuous)
                .strokeBorder(.white.opacity(0.04), lineWidth: 0.5)
        )
    }
}

// MARK: - Your team card

private struct YourTeamCard: View {
    let team: LeagueRepository.TeamWithRoster

    private func initials(_ s: String) -> String {
        s.split(separator: " ").prefix(2).compactMap(\.first).map(String.init).joined().uppercased()
    }

    private var capColor: Color {
        let n = NSDecimalNumber(decimal: team.capSalary).doubleValue
        if n > 300 { return Theme.Status.over }
        if n >= 260 { return Theme.Status.warn }
        return Theme.Status.safe
    }

    var body: some View {
        NavigationLink {
            TeamRosterView(teamWithRoster: team)
        } label: {
            VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                HStack(spacing: Theme.Spacing.md) {
                    TeamAvatarView(
                        masterName: team.owner.masterName,
                        initials: initials(team.owner.fullName),
                        size: 76
                    )
                    VStack(alignment: .leading, spacing: 4) {
                        Text("YOUR TEAM")
                            .font(AppFont.eyebrow)
                            .tracking(1.4)
                            .foregroundStyle(Theme.Accent.primary)
                        Text(team.espnTeamName.uppercased())
                            .font(AppFont.titleL)
                            .foregroundStyle(Theme.Text.primary)
                            .lineLimit(2)
                            .minimumScaleFactor(0.7)
                            .tracking(0.3)
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Theme.Text.tertiary)
                }
                CapBar(used: team.capSalary, cap: 300)
                HStack(spacing: Theme.Spacing.lg) {
                    inlineStat("Contracts", value: "\(team.rosterCount)")
                    inlineStat("Cap", value: MoneyFormatter.string(team.capSalary), color: capColor)
                    inlineStat(
                        "Headroom",
                        value: MoneyFormatter.string(max(Decimal(0), 300 - team.capSalary)),
                        color: capColor
                    )
                }
            }
            .padding(Theme.Spacing.lg)
            .background(
                Theme.BG.card,
                in: RoundedRectangle(cornerRadius: Theme.Radius.large, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.large, style: .continuous)
                    .strokeBorder(.white.opacity(0.04), lineWidth: 0.5)
            )
        }
        .buttonStyle(.plain)
    }

    private func inlineStat(_ label: String, value: String,
                            color: Color = Theme.Text.primary) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label.uppercased())
                .font(AppFont.eyebrow)
                .tracking(1.0)
                .foregroundStyle(Theme.Text.tertiary)
            Text(value)
                .font(AppFont.rowStrong)
                .tabularNumerals()
                .foregroundStyle(color)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
