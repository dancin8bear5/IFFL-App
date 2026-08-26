import SwiftUI

struct RosterListView: View {
    @State private var teams: [LeagueRepository.TeamWithRoster] = []
    @State private var isLoading = true
    @State private var error: String?

    var body: some View {
        NavigationStack {
            ZStack {
                Color.bgPrimary.ignoresSafeArea()
                content
            }
            .navigationTitle("Rosters")
            .navigationBarTitleDisplayMode(.large)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .task { await load() }
            .refreshable { await load() }
        }
    }

    @ViewBuilder
    private var content: some View {
        if isLoading && teams.isEmpty {
            ProgressView().controlSize(.large).tint(.textSecondary)
        } else if let error {
            errorView(error)
        } else {
            list
        }
    }

    private var list: some View {
        ScrollView {
            VStack(spacing: Theme.Spacing.md) {
                summaryHeader
                ForEach(teams) { team in
                    NavigationLink {
                        TeamRosterView(teamWithRoster: team)
                    } label: {
                        TeamCardView(team: team)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, Theme.Spacing.lg)
            .padding(.bottom, 96)   // clear the tab bar
        }
    }

    private var summaryHeader: some View {
        let overCap = teams.filter { $0.capSalary > 300 }.count
        let totalContracts = teams.reduce(0) { $0 + $1.rosterCount }
        return HStack(spacing: 0) {
            stat(value: "\(teams.count)", label: "Teams")
            statDivider
            stat(value: "\(totalContracts)", label: "Contracts")
            statDivider
            stat(value: "\(overCap)",
                 label: "Over",
                 color: overCap > 0 ? Theme.Status.over : Theme.Status.safe)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, Theme.Spacing.md)
        .padding(.horizontal, Theme.Spacing.md)
        .background(Theme.BG.elevated, in: RoundedRectangle(cornerRadius: Theme.Radius.large))
        .padding(.top, Theme.Spacing.sm)
    }

    private func stat(value: String, label: String, color: Color = Theme.Text.primary) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(AppFont.titleL)
                .tabularNumerals()
                .foregroundStyle(color)
                .lineLimit(1)
                .fixedSize()
            Text(label.uppercased())
                .font(AppFont.eyebrow)
                .tracking(1.0)
                .foregroundStyle(Theme.Text.tertiary)
                .lineLimit(1)
                .fixedSize()
        }
        .frame(maxWidth: .infinity)
    }

    private var statDivider: some View {
        Rectangle()
            .fill(Theme.BG.divider)
            .frame(width: 1, height: 32)
    }

    private func errorView(_ msg: String) -> some View {
        VStack(spacing: Theme.Spacing.md) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 36))
                .foregroundStyle(Theme.Status.over)
            Text("Couldn't load rosters")
                .font(AppFont.titleM)
            Text(msg)
                .font(AppFont.caption)
                .foregroundStyle(Theme.Text.secondary)
                .multilineTextAlignment(.center)
            Button("Retry") { Task { await load() } }
                .buttonStyle(.borderedProminent)
                .tint(Theme.Accent.primary)
                .padding(.top, Theme.Spacing.sm)
        }
        .padding(Theme.Spacing.xl)
    }

    private func load() async {
        isLoading = true; error = nil
        do {
            teams = try await LeagueRepository.shared.fetchTeamsWithRosters()
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }
}

private struct TeamCardView: View {
    let team: LeagueRepository.TeamWithRoster

    private var capColor: Color {
        let n = NSDecimalNumber(decimal: team.capSalary).doubleValue
        if n > 300 { return Theme.Status.over }
        if n >= 260 { return Theme.Status.warn }
        return Theme.Status.safe
    }

    private func initials(of fullName: String) -> String {
        fullName.split(separator: " ").prefix(2).compactMap(\.first).map(String.init).joined().uppercased()
    }

    var body: some View {
        HStack(spacing: Theme.Spacing.md) {
            TeamAvatarView(
                masterName: team.owner.masterName,
                initials: initials(of: team.owner.fullName),
                size: 64
            )
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(team.owner.fullName.uppercased())
                        .font(AppFont.eyebrow)
                        .tracking(1.0)
                        .foregroundStyle(Theme.Text.tertiary)
                    if team.owner.isCommissioner {
                        roleTag("COMMISH", color: Theme.Accent.primary)
                    } else if team.owner.isTreasurer {
                        roleTag("TREAS", color: Theme.Accent.cool)
                    }
                }
                Text(team.espnTeamName.uppercased())
                    .font(AppFont.titleL)
                    .foregroundStyle(Theme.Text.primary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .tracking(0.3)
                CapBar(used: team.capSalary, cap: 300, compact: true)
                    .frame(maxWidth: .infinity)
                HStack(spacing: 12) {
                    Text("\(team.rosterCount) contracts")
                        .font(AppFont.caption)
                        .foregroundStyle(Theme.Text.tertiary)
                    HStack(spacing: 3) {
                        Text(MoneyFormatter.string(team.capSalary))
                            .font(AppFont.captionStrong)
                            .tabularNumerals()
                            .foregroundStyle(capColor)
                        Text("/ $300")
                            .font(AppFont.caption)
                            .tabularNumerals()
                            .foregroundStyle(Theme.Text.tertiary)
                    }
                }
            }
            Image(systemName: "chevron.right")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Theme.Text.tertiary)
        }
        .padding(Theme.Spacing.md)
        .background(Theme.BG.card, in: RoundedRectangle(cornerRadius: Theme.Radius.large, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.large, style: .continuous)
                .strokeBorder(Color.white.opacity(0.04), lineWidth: 0.5)
        )
    }

    private func roleTag(_ label: String, color: Color) -> some View {
        Text(label)
            .font(.system(size: 9, weight: .black))
            .tracking(0.8)
            .foregroundStyle(color)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(color.opacity(0.15), in: Capsule())
    }
}
