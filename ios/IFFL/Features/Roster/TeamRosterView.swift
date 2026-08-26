import SwiftUI

struct TeamRosterView: View {
    let teamWithRoster: LeagueRepository.TeamWithRoster

    @State private var contracts: [LeagueRepository.ContractWithPlayer] = []
    @State private var isLoading = true
    @State private var error: String?
    @State private var scrollOffset: CGFloat = 0

    /// Height of the parallax hero. The image extends under the nav bar.
    private let heroHeight: CGFloat = 360

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                hero
                content
                Spacer().frame(height: 120)
            }
        }
        .background(Color.bgPrimary)
        .ignoresSafeArea(edges: .top)
        .scrollIndicators(.hidden)
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .task { await load() }
    }

    // MARK: hero

    private var hero: some View {
        GeometryReader { geo in
            ZStack(alignment: .bottomLeading) {
                avatarBackground(width: geo.size.width)
                heroGradient
                heroLabel
            }
            .frame(width: geo.size.width, height: heroHeight)
            .clipped()
        }
        .frame(height: heroHeight)
    }

    private func avatarBackground(width: CGFloat) -> some View {
        Group {
            if let img = UIImage(named: avatarFilename) {
                Image(uiImage: img)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(width: width, height: heroHeight)
                    .clipped()
            } else {
                LinearGradient(
                    colors: [Theme.BG.elevated, Theme.BG.primary],
                    startPoint: .top, endPoint: .bottom
                )
            }
        }
    }

    private var heroGradient: some View {
        LinearGradient(
            stops: [
                .init(color: .black.opacity(0.0), location: 0.0),
                .init(color: .black.opacity(0.35), location: 0.55),
                .init(color: .black.opacity(0.92), location: 0.95),
                .init(color: .black, location: 1.0),
            ],
            startPoint: .top, endPoint: .bottom
        )
    }

    private var heroLabel: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            Text(teamWithRoster.owner.fullName.uppercased())
                .font(AppFont.eyebrow)
                .tracking(1.4)
                .foregroundStyle(.white.opacity(0.75))

            Text(teamWithRoster.espnTeamName.uppercased())
                .font(AppFont.displayL)
                .foregroundStyle(.white)
                .lineLimit(2)
                .minimumScaleFactor(0.7)
                .tracking(0.4)
                .shadow(color: .black.opacity(0.4), radius: 8, y: 2)
                .accessibilityAddTraits(.isHeader)

            HStack(spacing: 6) {
                heroBadge("\(teamWithRoster.rosterCount) Contracts")
                heroBadge("Season 2026")
                if teamWithRoster.owner.isCommissioner {
                    heroBadge("Commish", filled: true)
                } else if teamWithRoster.owner.isTreasurer {
                    heroBadge("Treasurer", filled: true)
                }
            }
            .padding(.top, 4)
        }
        .padding(.horizontal, Theme.Spacing.lg)
        .padding(.bottom, Theme.Spacing.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func heroBadge(_ text: String, filled: Bool = false) -> some View {
        Text(text.uppercased())
            .font(.system(size: 10, weight: .heavy))
            .tracking(0.8)
            .foregroundStyle(filled ? .black : .white.opacity(0.85))
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(
                Capsule().fill(filled ? Color.white : Color.white.opacity(0.18))
            )
    }

    // MARK: content body

    @ViewBuilder
    private var content: some View {
        capCard
        rosterSection
    }

    private var capCard: some View {
        CapBar(used: teamWithRoster.capSalary, cap: 300)
            .padding(Theme.Spacing.lg)
            .background(
                Theme.BG.card,
                in: RoundedRectangle(cornerRadius: Theme.Radius.large, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.large, style: .continuous)
                    .strokeBorder(.white.opacity(0.04), lineWidth: 0.5)
            )
            .padding(.horizontal, Theme.Spacing.lg)
            .padding(.top, Theme.Spacing.md)
    }

    @ViewBuilder
    private var rosterSection: some View {
        SectionHeader(title: "Roster (\(contracts.count))")
        if let error {
            errorView(error)
        } else if isLoading && contracts.isEmpty {
            ProgressView()
                .frame(maxWidth: .infinity)
                .padding(.vertical, 40)
                .tint(Theme.Text.secondary)
        } else {
            contractList
        }
    }

    private func errorView(_ msg: String) -> some View {
        VStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle")
                .font(.title2)
                .foregroundStyle(Theme.Status.over)
            Text(msg)
                .font(AppFont.caption)
                .foregroundStyle(Theme.Text.secondary)
                .multilineTextAlignment(.center)
        }
        .padding()
    }

    private var contractList: some View {
        LazyVStack(spacing: 0, pinnedViews: []) {
            ForEach(groupedByPosition, id: \.0) { (pos, list) in
                positionGroup(pos: pos, contracts: list)
            }
        }
    }

    private var groupedByPosition: [(Player.Position, [LeagueRepository.ContractWithPlayer])] {
        let grouped = Dictionary(grouping: contracts) { $0.player.position }
        return Player.Position.allCases.compactMap { pos in
            guard let xs = grouped[pos], !xs.isEmpty else { return nil }
            return (pos, xs)
        }
    }

    private func positionGroup(pos: Player.Position,
                                contracts: [LeagueRepository.ContractWithPlayer]) -> some View {
        VStack(spacing: 0) {
            HStack {
                Text(pos.rawValue)
                    .font(AppFont.captionStrong)
                    .tracking(1.0)
                    .foregroundStyle(Theme.Position.color(for: pos.rawValue))
                Spacer()
                Text("\(contracts.count) • \(MoneyFormatter.string(groupTotal(contracts)))")
                    .font(AppFont.caption)
                    .tabularNumerals()
                    .foregroundStyle(Theme.Text.tertiary)
            }
            .padding(.horizontal, Theme.Spacing.lg)
            .padding(.top, Theme.Spacing.md)
            .padding(.bottom, Theme.Spacing.xs)

            VStack(spacing: 0) {
                ForEach(contracts) { contract in
                    ContractRow(contract: contract)
                    if contract.id != contracts.last?.id {
                        Divider()
                            .background(Theme.BG.divider)
                            .padding(.leading, Theme.Spacing.lg)
                    }
                }
            }
            .background(
                Theme.BG.card,
                in: RoundedRectangle(cornerRadius: Theme.Radius.large, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.large, style: .continuous)
                    .strokeBorder(.white.opacity(0.04), lineWidth: 0.5)
            )
            .padding(.horizontal, Theme.Spacing.lg)
        }
    }

    private func groupTotal(_ contracts: [LeagueRepository.ContractWithPlayer]) -> Decimal {
        contracts.reduce(Decimal(0)) { $0 + $1.currentKeeperCost }
    }

    private var avatarFilename: String {
        teamWithRoster.owner.masterName.replacingOccurrences(of: " ", with: "")
    }

    private func load() async {
        isLoading = true; error = nil
        do {
            contracts = try await LeagueRepository.shared.fetchContracts(
                teamId: teamWithRoster.id
            )
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }
}

private struct ContractRow: View {
    let contract: LeagueRepository.ContractWithPlayer

    var body: some View {
        HStack(alignment: .center, spacing: Theme.Spacing.md) {
            VStack(alignment: .leading, spacing: 4) {
                Text(contract.player.fullName)
                    .font(AppFont.rowStrong)
                    .foregroundStyle(Theme.Text.primary)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    if let nflTeam = contract.player.nflTeam {
                        Text(nflTeam)
                            .font(AppFont.caption)
                            .foregroundStyle(Theme.Text.tertiary)
                    }
                    sourceBadge
                    if contract.yearsKept > 0 {
                        keptDots
                    }
                }
            }
            Spacer(minLength: Theme.Spacing.sm)
            VStack(alignment: .trailing, spacing: 2) {
                Text(MoneyFormatter.string(contract.currentKeeperCost))
                    .font(AppFont.rowStrong)
                    .tabularNumerals()
                    .foregroundStyle(Theme.Text.primary)
                if let next = contract.nextSeasonCost {
                    HStack(spacing: 2) {
                        Image(systemName: "arrow.up.right")
                            .font(.system(size: 9, weight: .heavy))
                        Text(MoneyFormatter.string(next))
                            .font(AppFont.caption)
                            .tabularNumerals()
                    }
                    .foregroundStyle(Theme.Text.tertiary)
                } else {
                    Text("EXPIRES")
                        .font(.system(size: 9, weight: .heavy))
                        .tracking(0.6)
                        .foregroundStyle(Theme.Status.warn)
                }
            }
        }
        .padding(.horizontal, Theme.Spacing.md)
        .padding(.vertical, Theme.Spacing.md)
        .accessibilityElement(children: .combine)
    }

    private var sourceBadge: some View {
        let (label, color) = sourceMetadata
        return Text(label)
            .font(.system(size: 9, weight: .heavy))
            .tracking(0.6)
            .foregroundStyle(color)
            .padding(.horizontal, 5)
            .padding(.vertical, 2)
            .background(color.opacity(0.14), in: Capsule())
    }

    private var sourceMetadata: (String, Color) {
        switch contract.source {
        case .auction:      return ("AUCTION",    Theme.Accent.primary)
        case .rookieDraft:  return (rookieLabel,  Theme.Accent.cool)
        case .draftPick:    return (rookieLabel,  Theme.Accent.cool)
        case .faab:         return ("FAAB",       Theme.Status.safe)
        case .freeAgent:    return ("FA",         Theme.Status.safe)
        case .trade:        return ("TRADE",      Theme.Status.warn)
        case .keeper:       return ("KEEPER",     Theme.Text.secondary)
        }
    }

    private var rookieLabel: String {
        if let r = contract.rookieRound, let y = contract.rookieYear {
            return "ROOKIE \(y) R\(r)"
        }
        return "ROOKIE"
    }

    private var keptDots: some View {
        HStack(spacing: 2) {
            ForEach(0..<5) { i in
                Circle()
                    .fill(i < contract.yearsKept ? Theme.Status.warn : Theme.BG.divider)
                    .frame(width: 5, height: 5)
            }
        }
        .accessibilityLabel("Kept \(contract.yearsKept) of 5 seasons")
    }
}
