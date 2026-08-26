import SwiftUI

/// Modal entry point for proposing a trade. Hosts the multi-step flow.
struct ProposeTradeFlow: View {
    let myTeam: LeagueRepository.TeamWithRoster
    let allTeams: [LeagueRepository.TeamWithRoster]
    let onCompleted: (UUID) -> Void

    @State private var draft: TradeProposalDraft
    @Environment(\.dismiss) private var dismiss

    init(myTeam: LeagueRepository.TeamWithRoster,
         allTeams: [LeagueRepository.TeamWithRoster],
         onCompleted: @escaping (UUID) -> Void) {
        self.myTeam = myTeam
        self.allTeams = allTeams
        self.onCompleted = onCompleted
        self._draft = State(initialValue: TradeProposalDraft(myTeam: myTeam))
    }

    var body: some View {
        NavigationStack {
            PickCounterpartyView(
                draft: draft,
                allTeams: allTeams.filter { $0.id != myTeam.id }
            )
            .navigationTitle("Propose Trade")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .tint(Theme.Text.secondary)
                }
            }
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbarBackground(Theme.BG.primary, for: .navigationBar)
        }
        .environment(draft)
        .preferredColorScheme(.dark)
        .onAppear {
            Task {
                draft.myContracts = (try? await LeagueRepository.shared.fetchContracts(
                    teamId: myTeam.id
                )) ?? []
                draft.myPicks = (try? await LeagueRepository.shared.fetchRookiePicks(
                    ownerTeamId: myTeam.id
                )) ?? []
            }
        }
    }
}

// MARK: - Step 1: Counterparty picker

private struct PickCounterpartyView: View {
    let draft: TradeProposalDraft
    let allTeams: [LeagueRepository.TeamWithRoster]

    @State private var selected: UUID?

    private let columns = [
        GridItem(.flexible(), spacing: 12),
        GridItem(.flexible(), spacing: 12),
    ]

    var body: some View {
        ZStack {
            Color.bgPrimary.ignoresSafeArea()
            ScrollView {
                LazyVGrid(columns: columns, spacing: 12) {
                    ForEach(allTeams) { team in
                        teamCard(team)
                    }
                }
                .padding(Theme.Spacing.lg)
                .padding(.bottom, 96)
            }
            VStack {
                Spacer()
                if let id = selected, let team = allTeams.first(where: { $0.id == id }) {
                    nextButton(team: team)
                }
            }
        }
    }

    private func teamCard(_ team: LeagueRepository.TeamWithRoster) -> some View {
        let isSelected = (selected == team.id)
        let initials = team.owner.fullName.split(separator: " ").prefix(2)
            .compactMap(\.first).map(String.init).joined().uppercased()
        return Button {
            withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                selected = team.id
            }
        } label: {
            VStack(spacing: Theme.Spacing.sm) {
                TeamAvatarView(
                    masterName: team.owner.masterName,
                    initials: initials,
                    size: 96
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 96 * 0.22, style: .continuous)
                        .strokeBorder(
                            isSelected ? Theme.Accent.primary : Color.clear,
                            lineWidth: 3
                        )
                )
                Text(team.owner.fullName.uppercased())
                    .font(AppFont.eyebrow)
                    .tracking(1.0)
                    .foregroundStyle(Theme.Text.tertiary)
                    .lineLimit(1)
                Text(team.espnTeamName.uppercased())
                    .font(AppFont.captionStrong)
                    .foregroundStyle(Theme.Text.primary)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .minimumScaleFactor(0.7)
                    .frame(height: 32, alignment: .top)
            }
            .padding(Theme.Spacing.md)
            .frame(maxWidth: .infinity)
            .background(
                Theme.BG.card,
                in: RoundedRectangle(cornerRadius: Theme.Radius.large, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.large, style: .continuous)
                    .strokeBorder(
                        isSelected ? Theme.Accent.primary.opacity(0.6) : .white.opacity(0.04),
                        lineWidth: isSelected ? 1.5 : 0.5
                    )
            )
        }
        .buttonStyle(.plain)
        .sensoryFeedback(.selection, trigger: isSelected)
    }

    private func nextButton(team: LeagueRepository.TeamWithRoster) -> some View {
        NavigationLink {
            BuildAssetsView(draft: draft)
                .onAppear {
                    draft.theirTeam = team
                    Task {
                        draft.theirContracts = (try? await LeagueRepository.shared.fetchContracts(
                            teamId: team.id
                        )) ?? []
                        draft.theirPicks = (try? await LeagueRepository.shared.fetchRookiePicks(
                            ownerTeamId: team.id
                        )) ?? []
                    }
                }
        } label: {
            HStack(spacing: 8) {
                Text("Build Trade with")
                    .font(AppFont.bodyMedium)
                Text(team.owner.masterName)
                    .font(AppFont.bodyMedium.weight(.bold))
                Image(systemName: "arrow.right")
                    .font(.body.weight(.heavy))
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(Theme.Accent.primary, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .padding(.horizontal, Theme.Spacing.lg)
            .padding(.bottom, Theme.Spacing.lg)
        }
        .buttonStyle(.plain)
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }
}
