import SwiftUI

/// Step 2: select what each side gives. Two scrollable sections (your assets,
/// their assets) with a sticky cap-impact bar pinned to the top that updates
/// in real time as you toggle.
struct BuildAssetsView: View {
    @Bindable var draft: TradeProposalDraft
    @State private var showFAABSheet = false
    @State private var faabSide: Side = .mine

    enum Side { case mine, theirs }

    var body: some View {
        ZStack {
            Color.bgPrimary.ignoresSafeArea()

            ScrollView {
                LazyVStack(spacing: 0, pinnedViews: [.sectionHeaders]) {
                    Section {
                        sideSection(
                            title: "YOU GIVE",
                            owner: draft.myTeam.owner.fullName,
                            contracts: draft.myContracts,
                            selectedContracts: draft.myContractsGiving,
                            picks: draft.myPicks,
                            selectedPicks: draft.myPicksGiving,
                            faab: draft.myFAABGiving,
                            onToggleContract: { toggleMyContract($0) },
                            onTogglePick: { toggleMyPick($0) },
                            onTapFAAB: { faabSide = .mine; showFAABSheet = true }
                        )
                        Spacer().frame(height: Theme.Spacing.lg)
                        if let theirs = draft.theirTeam {
                            sideSection(
                                title: "THEY GIVE",
                                owner: theirs.owner.fullName,
                                contracts: draft.theirContracts,
                                selectedContracts: draft.theirContractsGiving,
                                picks: draft.theirPicks,
                                selectedPicks: draft.theirPicksGiving,
                                faab: draft.theirFAABGiving,
                                onToggleContract: { toggleTheirContract($0) },
                                onTogglePick: { toggleTheirPick($0) },
                                onTapFAAB: { faabSide = .theirs; showFAABSheet = true }
                            )
                        }
                        Spacer().frame(height: 120)
                    } header: {
                        capImpactBar
                            .background(Theme.BG.primary.opacity(0.96))
                    }
                }
            }

            VStack { Spacer(); reviewButton }
        }
        .navigationTitle("Build Trade")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .sheet(isPresented: $showFAABSheet) {
            FAABEntrySheet(
                title: faabSide == .mine ? "FAAB You Give" : "FAAB They Give",
                amount: faabSide == .mine ? $draft.myFAABGiving : $draft.theirFAABGiving
            )
            .presentationDetents([.height(280)])
            .presentationDragIndicator(.visible)
        }
    }

    // MARK: cap-impact sticky header

    private var capImpactBar: some View {
        HStack(spacing: 0) {
            capPill(
                label: draft.myTeam.owner.masterName,
                current: draft.myTeam.capSalary,
                projected: draft.myProjectedCap,
                isOver: draft.myCrossesCap
            )
            capArrow
            if let theirs = draft.theirTeam {
                capPill(
                    label: theirs.owner.masterName,
                    current: theirs.capSalary,
                    projected: draft.theirProjectedCap,
                    isOver: draft.theirCrossesCap
                )
            }
        }
        .padding(.horizontal, Theme.Spacing.lg)
        .padding(.vertical, Theme.Spacing.md)
        .background(.ultraThinMaterial)
        .overlay(
            Rectangle().fill(Theme.BG.divider).frame(height: 0.5),
            alignment: .bottom
        )
    }

    private func capPill(label: String,
                        current: Decimal,
                        projected: Decimal,
                        isOver: Bool) -> some View {
        let delta = projected - current
        let projectedColor: Color = isOver
            ? Theme.Status.over
            : (projected >= 260 ? Theme.Status.warn : Theme.Status.safe)
        return VStack(alignment: .leading, spacing: 4) {
            Text(label.uppercased())
                .font(AppFont.eyebrow)
                .tracking(1.0)
                .foregroundStyle(Theme.Text.tertiary)
                .lineLimit(1)
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(MoneyFormatter.string(projected))
                    .font(AppFont.titleM)
                    .tabularNumerals()
                    .foregroundStyle(projectedColor)
                    .contentTransition(.numericText())
                Text(deltaText(delta))
                    .font(AppFont.caption)
                    .tabularNumerals()
                    .foregroundStyle(deltaColor(delta))
                    .contentTransition(.numericText())
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func deltaText(_ delta: Decimal) -> String {
        if delta == 0 { return "—" }
        let sign = delta > 0 ? "+" : "−"
        return "\(sign)\(MoneyFormatter.string(abs(delta)))"
    }

    private func deltaColor(_ delta: Decimal) -> Color {
        if delta == 0 { return Theme.Text.tertiary }
        return delta > 0 ? Theme.Status.warn : Theme.Status.safe
    }

    private var capArrow: some View {
        Image(systemName: "arrow.left.arrow.right")
            .font(.system(size: 14, weight: .heavy))
            .foregroundStyle(Theme.Text.tertiary)
            .frame(width: 32)
    }

    // MARK: side section

    @ViewBuilder
    private func sideSection(
        title: String,
        owner: String,
        contracts: [LeagueRepository.ContractWithPlayer],
        selectedContracts: Set<UUID>,
        picks: [RookiePick],
        selectedPicks: Set<UUID>,
        faab: Decimal,
        onToggleContract: @escaping (UUID) -> Void,
        onTogglePick: @escaping (UUID) -> Void,
        onTapFAAB: @escaping () -> Void
    ) -> some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            HStack {
                Text(title)
                    .font(AppFont.eyebrow)
                    .tracking(1.4)
                    .foregroundStyle(Theme.Accent.primary)
                Text("·")
                    .foregroundStyle(Theme.Text.tertiary)
                Text(owner.uppercased())
                    .font(AppFont.eyebrow)
                    .tracking(1.0)
                    .foregroundStyle(Theme.Text.secondary)
                Spacer()
                if !selectedContracts.isEmpty || !selectedPicks.isEmpty || faab > 0 {
                    Text("\(selectedContracts.count + selectedPicks.count + (faab > 0 ? 1 : 0)) selected")
                        .font(AppFont.caption)
                        .foregroundStyle(Theme.Accent.primary)
                }
            }
            .padding(.horizontal, Theme.Spacing.lg)
            .padding(.top, Theme.Spacing.lg)

            // Contracts
            if !contracts.isEmpty {
                VStack(spacing: 0) {
                    ForEach(contracts) { c in
                        SelectableContractRow(
                            contract: c,
                            isSelected: selectedContracts.contains(c.id)
                        ) { onToggleContract(c.id) }
                        if c.id != contracts.last?.id {
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

            // Picks
            if !picks.isEmpty {
                Text.eyebrow("Rookie Picks")
                    .padding(.horizontal, Theme.Spacing.lg)
                    .padding(.top, Theme.Spacing.sm)
                LazyVGrid(
                    columns: [GridItem(.adaptive(minimum: 100), spacing: 8)],
                    spacing: 8
                ) {
                    ForEach(picks) { p in
                        SelectablePickChip(
                            pick: p,
                            isSelected: selectedPicks.contains(p.id)
                        ) { onTogglePick(p.id) }
                    }
                }
                .padding(.horizontal, Theme.Spacing.lg)
            }

            // FAAB
            Button(action: onTapFAAB) {
                HStack {
                    Image(systemName: "dollarsign.circle")
                        .font(.title3)
                        .foregroundStyle(faab > 0 ? Theme.Accent.primary : Theme.Text.tertiary)
                    VStack(alignment: .leading) {
                        Text("FAAB Cash")
                            .font(AppFont.row)
                            .foregroundStyle(Theme.Text.primary)
                        Text(faab > 0 ? "Adding \(MoneyFormatter.string(faab))" : "Tap to add cash")
                            .font(AppFont.caption)
                            .tabularNumerals()
                            .foregroundStyle(faab > 0 ? Theme.Accent.primary : Theme.Text.tertiary)
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Theme.Text.tertiary)
                }
                .padding(Theme.Spacing.md)
                .background(
                    Theme.BG.card,
                    in: RoundedRectangle(cornerRadius: Theme.Radius.large, style: .continuous)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.Radius.large, style: .continuous)
                        .strokeBorder(
                            faab > 0 ? Theme.Accent.primary.opacity(0.4) : .white.opacity(0.04),
                            lineWidth: faab > 0 ? 1.5 : 0.5
                        )
                )
                .padding(.horizontal, Theme.Spacing.lg)
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: review button

    private var reviewButton: some View {
        let enabled = draft.hasAssetsBothSides
        return NavigationLink {
            ReviewTradeView(draft: draft)
        } label: {
            HStack(spacing: 8) {
                Text("Review Trade")
                    .font(AppFont.bodyMedium.weight(.bold))
                Image(systemName: "arrow.right")
                    .font(.body.weight(.heavy))
            }
            .foregroundStyle(enabled ? .white : Theme.Text.tertiary)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(
                enabled ? Theme.Accent.primary : Theme.BG.card,
                in: RoundedRectangle(cornerRadius: 14, style: .continuous)
            )
            .padding(.horizontal, Theme.Spacing.lg)
            .padding(.bottom, Theme.Spacing.lg)
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.7)
    }

    // MARK: actions

    private func toggleMyContract(_ id: UUID) {
        toggle(id: id, in: \.myContractsGiving)
    }
    private func toggleTheirContract(_ id: UUID) {
        toggle(id: id, in: \.theirContractsGiving)
    }
    private func toggleMyPick(_ id: UUID) {
        toggle(id: id, in: \.myPicksGiving)
    }
    private func toggleTheirPick(_ id: UUID) {
        toggle(id: id, in: \.theirPicksGiving)
    }

    private func toggle(id: UUID, in keyPath: ReferenceWritableKeyPath<TradeProposalDraft, Set<UUID>>) {
        withAnimation(.spring(response: 0.32, dampingFraction: 0.85)) {
            if draft[keyPath: keyPath].contains(id) {
                draft[keyPath: keyPath].remove(id)
            } else {
                draft[keyPath: keyPath].insert(id)
            }
        }
    }
}

// MARK: - Selectable contract row

private struct SelectableContractRow: View {
    let contract: LeagueRepository.ContractWithPlayer
    let isSelected: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(alignment: .center, spacing: Theme.Spacing.md) {
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .font(.title3)
                    .foregroundStyle(isSelected ? Theme.Accent.primary : Theme.Text.tertiary)
                    .symbolEffect(.bounce, value: isSelected)

                VStack(alignment: .leading, spacing: 4) {
                    Text(contract.player.fullName)
                        .font(AppFont.rowStrong)
                        .foregroundStyle(Theme.Text.primary)
                        .lineLimit(1)
                    HStack(spacing: 6) {
                        Text(contract.player.position.rawValue)
                            .font(AppFont.caption.weight(.heavy))
                            .foregroundStyle(Theme.Position.color(for: contract.player.position.rawValue))
                        if let nfl = contract.player.nflTeam {
                            Text(nfl)
                                .font(AppFont.caption)
                                .foregroundStyle(Theme.Text.tertiary)
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
                        Text("\(MoneyFormatter.string(next)) next yr")
                            .font(.system(size: 10))
                            .tabularNumerals()
                            .foregroundStyle(Theme.Text.tertiary)
                    }
                }
            }
            .padding(.horizontal, Theme.Spacing.md)
            .padding(.vertical, Theme.Spacing.md)
            .background(isSelected ? Theme.Accent.primary.opacity(0.08) : Color.clear)
        }
        .buttonStyle(.plain)
        .sensoryFeedback(.selection, trigger: isSelected)
    }
}

// MARK: - Selectable pick chip

private struct SelectablePickChip: View {
    let pick: RookiePick
    let isSelected: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(spacing: 2) {
                Text("\(pick.pickYear)")
                    .font(.system(size: 10, weight: .heavy))
                    .foregroundStyle(Theme.Text.tertiary)
                Text(pick.slot.map { "\(pick.round).\(String(format: "%02d", $0))" } ?? "R\(pick.round)")
                    .font(AppFont.captionStrong)
                    .tabularNumerals()
                    .foregroundStyle(Theme.Text.primary)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, Theme.Spacing.sm)
            .background(
                isSelected ? Theme.Accent.primary : Theme.BG.card,
                in: RoundedRectangle(cornerRadius: Theme.Radius.medium, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.medium, style: .continuous)
                    .strokeBorder(
                        isSelected ? .clear : .white.opacity(0.08),
                        lineWidth: 1
                    )
            )
            .foregroundStyle(isSelected ? .white : Theme.Text.primary)
        }
        .buttonStyle(.plain)
        .sensoryFeedback(.selection, trigger: isSelected)
    }
}

// MARK: - FAAB entry sheet

private struct FAABEntrySheet: View {
    let title: String
    @Binding var amount: Decimal
    @Environment(\.dismiss) private var dismiss
    @State private var input: String = ""

    var body: some View {
        VStack(spacing: Theme.Spacing.lg) {
            Text(title)
                .font(AppFont.titleL)
            HStack(spacing: 4) {
                Text("$")
                    .font(.system(size: 48, weight: .light, design: .rounded))
                    .foregroundStyle(Theme.Text.secondary)
                TextField("0", text: $input)
                    .keyboardType(.numberPad)
                    .multilineTextAlignment(.center)
                    .font(.system(size: 48, weight: .heavy, design: .rounded))
                    .frame(maxWidth: 180)
                    .tabularNumerals()
            }
            HStack(spacing: 8) {
                ForEach([Decimal(0), 5, 10, 25, 50], id: \.self) { val in
                    Button("\(MoneyFormatter.string(val))") {
                        input = "\(val)"
                    }
                    .font(AppFont.captionStrong)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Theme.BG.card, in: Capsule())
                    .foregroundStyle(Theme.Text.primary)
                }
            }
            Button("Done") {
                let trimmed = input.trimmingCharacters(in: .whitespaces)
                amount = Decimal(string: trimmed) ?? 0
                dismiss()
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(Theme.Accent.primary, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .foregroundStyle(.white)
            .font(AppFont.bodyMedium.weight(.bold))
        }
        .padding()
        .background(Theme.BG.elevated)
        .onAppear { input = amount > 0 ? "\(amount)" : "" }
    }
}
