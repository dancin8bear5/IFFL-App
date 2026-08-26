import SwiftUI

/// Step 3: review the trade. Side-by-side breakdown + cap-impact summary +
/// optional notes + Submit. Shows a LuxTax warning panel if the projected
/// cap exceeds $300 for either team.
struct ReviewTradeView: View {
    @Bindable var draft: TradeProposalDraft
    @Environment(\.dismiss) private var dismiss

    @State private var isSubmitting = false
    @State private var error: String?
    @State private var showSuccess = false
    @State private var newTradeId: UUID?

    var body: some View {
        ZStack {
            Color.bgPrimary.ignoresSafeArea()
            ScrollView {
                LazyVStack(spacing: Theme.Spacing.md) {
                    capImpactSummary
                    if draft.myCrossesCap || draft.theirCrossesCap {
                        luxtaxWarning
                    }
                    sideSummary(
                        title: "\(draft.myTeam.owner.fullName.uppercased()) GIVES",
                        contracts: draft.myGivingContracts,
                        picks: draft.myGivingPicks,
                        faab: draft.myFAABGiving
                    )
                    if let theirs = draft.theirTeam {
                        sideSummary(
                            title: "\(theirs.owner.fullName.uppercased()) GIVES",
                            contracts: draft.theirGivingContracts,
                            picks: draft.theirGivingPicks,
                            faab: draft.theirFAABGiving
                        )
                    }
                    notesField
                    Spacer().frame(height: 120)
                }
                .padding(.horizontal, Theme.Spacing.lg)
                .padding(.top, Theme.Spacing.md)
            }
            VStack { Spacer(); submitButton }
        }
        .navigationTitle("Review")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .alert("Trade sent",
               isPresented: $showSuccess) {
            Button("Done") { dismiss() }
        } message: {
            Text("\(draft.theirTeam?.owner.fullName ?? "The counterparty") will see this in their inbox and can accept or reject.")
        }
        .alert("Couldn't send trade",
               isPresented: .constant(error != nil),
               presenting: error) { _ in
            Button("OK") { error = nil }
        } message: { msg in
            Text(msg)
        }
    }

    // MARK: cap summary

    private var capImpactSummary: some View {
        HStack(spacing: Theme.Spacing.md) {
            capPanel(
                label: draft.myTeam.owner.masterName,
                from: draft.myTeam.capSalary,
                to: draft.myProjectedCap,
                isOver: draft.myCrossesCap
            )
            capPanel(
                label: draft.theirTeam?.owner.masterName ?? "—",
                from: draft.theirTeam?.capSalary ?? 0,
                to: draft.theirProjectedCap,
                isOver: draft.theirCrossesCap
            )
        }
    }

    private func capPanel(label: String, from: Decimal, to: Decimal, isOver: Bool) -> some View {
        let color: Color = isOver ? Theme.Status.over :
            (to >= 260 ? Theme.Status.warn : Theme.Status.safe)
        return VStack(alignment: .leading, spacing: 6) {
            Text(label.uppercased())
                .font(AppFont.eyebrow)
                .tracking(1.0)
                .foregroundStyle(Theme.Text.tertiary)
            Text(MoneyFormatter.string(to))
                .font(AppFont.displayM)
                .tabularNumerals()
                .foregroundStyle(color)
                .contentTransition(.numericText())
            HStack(spacing: 4) {
                Text(MoneyFormatter.string(from))
                    .strikethrough()
                    .foregroundStyle(Theme.Text.tertiary)
                Image(systemName: "arrow.right")
                Text("\(MoneyFormatter.string(to))")
                    .foregroundStyle(color)
            }
            .font(AppFont.caption)
            .tabularNumerals()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.Spacing.md)
        .background(
            Theme.BG.card,
            in: RoundedRectangle(cornerRadius: Theme.Radius.large, style: .continuous)
        )
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.large, style: .continuous)
                .strokeBorder(.white.opacity(0.04), lineWidth: 0.5)
        )
    }

    private var luxtaxWarning: some View {
        HStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(Theme.Status.over)
                .font(.title3)
            VStack(alignment: .leading, spacing: 4) {
                Text("LUXURY TAX TRIGGER")
                    .font(AppFont.eyebrow)
                    .tracking(1.4)
                    .foregroundStyle(Theme.Status.over)
                Text("This trade pushes a team over the $300 cap.")
                    .font(AppFont.row)
                    .foregroundStyle(Theme.Text.primary)
                Text("Acceptance starts a 24-hour payment window: $25 to each of the 11 other owners ($275 total). Unpaid in 24h voids the trade.")
                    .font(AppFont.caption)
                    .foregroundStyle(Theme.Text.secondary)
            }
        }
        .padding(Theme.Spacing.md)
        .background(
            Theme.Status.over.opacity(0.10),
            in: RoundedRectangle(cornerRadius: Theme.Radius.large, style: .continuous)
        )
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.large, style: .continuous)
                .strokeBorder(Theme.Status.over.opacity(0.3), lineWidth: 0.5)
        )
    }

    // MARK: side summary

    private func sideSummary(title: String,
                              contracts: [LeagueRepository.ContractWithPlayer],
                              picks: [RookiePick],
                              faab: Decimal) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title)
                .font(AppFont.eyebrow)
                .tracking(1.4)
                .foregroundStyle(Theme.Accent.primary)
                .padding(.bottom, Theme.Spacing.xs)
            VStack(spacing: 0) {
                ForEach(contracts) { c in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(c.player.fullName)
                                .font(AppFont.rowStrong)
                                .foregroundStyle(Theme.Text.primary)
                            Text("\(c.player.position.rawValue) · \(c.player.nflTeam ?? "—")")
                                .font(AppFont.caption)
                                .foregroundStyle(Theme.Text.tertiary)
                        }
                        Spacer()
                        Text(MoneyFormatter.string(c.currentKeeperCost))
                            .font(AppFont.rowStrong)
                            .tabularNumerals()
                    }
                    .padding(Theme.Spacing.md)
                    if c.id != contracts.last?.id {
                        Divider().background(Theme.BG.divider).padding(.leading, Theme.Spacing.md)
                    }
                }
                if !picks.isEmpty {
                    if !contracts.isEmpty { Divider().background(Theme.BG.divider) }
                    LazyVGrid(
                        columns: [GridItem(.adaptive(minimum: 100), spacing: 8)],
                        spacing: 8
                    ) {
                        ForEach(picks) { p in
                            Text(p.label)
                                .font(AppFont.captionStrong)
                                .padding(.vertical, 6)
                                .frame(maxWidth: .infinity)
                                .background(Theme.BG.elevated, in: RoundedRectangle(cornerRadius: 8))
                        }
                    }
                    .padding(Theme.Spacing.md)
                }
                if faab > 0 {
                    Divider().background(Theme.BG.divider)
                    HStack {
                        Image(systemName: "dollarsign.circle.fill")
                            .foregroundStyle(Theme.Accent.primary)
                        Text("FAAB Cash")
                            .font(AppFont.row)
                        Spacer()
                        Text(MoneyFormatter.string(faab))
                            .font(AppFont.rowStrong)
                            .tabularNumerals()
                    }
                    .padding(Theme.Spacing.md)
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
        }
    }

    // MARK: notes

    private var notesField: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text.eyebrow("Note (optional)")
            TextField("Anything you want to say in GroupMe?", text: $draft.notes, axis: .vertical)
                .textFieldStyle(.plain)
                .lineLimit(2...4)
                .font(AppFont.row)
                .padding(Theme.Spacing.md)
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

    // MARK: submit button

    private var submitButton: some View {
        Button {
            Task { await submit() }
        } label: {
            HStack(spacing: 8) {
                if isSubmitting {
                    ProgressView().tint(.white)
                } else {
                    Text("Send Trade")
                        .font(AppFont.bodyMedium.weight(.bold))
                    Image(systemName: "paperplane.fill")
                        .font(.body)
                }
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(Theme.Accent.primary, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .padding(.horizontal, Theme.Spacing.lg)
            .padding(.bottom, Theme.Spacing.lg)
        }
        .buttonStyle(.plain)
        .disabled(isSubmitting)
        .sensoryFeedback(.success, trigger: showSuccess)
    }

    private func submit() async {
        isSubmitting = true
        defer { isSubmitting = false }
        do {
            let id = try await LeagueRepository.shared.proposeTrade(draft)
            self.newTradeId = id
            self.showSuccess = true
        } catch {
            self.error = error.localizedDescription
        }
    }
}
