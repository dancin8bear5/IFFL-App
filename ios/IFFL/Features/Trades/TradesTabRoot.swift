import SwiftUI

/// Trades tab. Inbox of pending + completed trades involving the current
/// owner, with a primary CTA to propose a new trade.
struct TradesTabRoot: View {
    @State private var trades: [LeagueRepository.TradeWithTeams] = []
    @State private var allTeams: [LeagueRepository.TeamWithRoster] = []
    @State private var myTeam: LeagueRepository.TeamWithRoster?
    @State private var isLoading = true
    @State private var error: String?
    @State private var showProposeFlow = false
    @State private var supabase = SupabaseService.shared

    var body: some View {
        NavigationStack {
            ZStack {
                Color.bgPrimary.ignoresSafeArea()
                content
            }
            .navigationTitle("Trades")
            .navigationBarTitleDisplayMode(.large)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showProposeFlow = true } label: {
                        Label("New", systemImage: "plus")
                            .labelStyle(.iconOnly)
                            .font(.body.weight(.semibold))
                    }
                    .disabled(myTeam == nil)
                    .tint(Theme.Accent.primary)
                }
            }
            .sheet(isPresented: $showProposeFlow) {
                if let myTeam {
                    ProposeTradeFlow(
                        myTeam: myTeam,
                        allTeams: allTeams
                    ) { _ in
                        Task { await load() }
                    }
                }
            }
            .task { await load() }
            .refreshable { await load() }
        }
    }

    @ViewBuilder
    private var content: some View {
        if isLoading && trades.isEmpty {
            ProgressView().controlSize(.large).tint(.textSecondary)
        } else if let error {
            Text(error).foregroundStyle(Theme.Status.over).padding()
        } else {
            ScrollView {
                LazyVStack(spacing: Theme.Spacing.md) {
                    proposeBanner
                    if pending.isEmpty && completed.isEmpty {
                        emptyState
                    } else {
                        if !pending.isEmpty {
                            SectionHeader(title: "Pending")
                            tradeList(pending)
                        }
                        if !completed.isEmpty {
                            SectionHeader(title: "Completed")
                            tradeList(completed)
                        }
                    }
                    Spacer().frame(height: 96)
                }
                .padding(.horizontal, Theme.Spacing.lg)
                .padding(.top, Theme.Spacing.sm)
            }
        }
    }

    private var proposeBanner: some View {
        Button { showProposeFlow = true } label: {
            HStack(spacing: 12) {
                Image(systemName: "arrow.left.arrow.right.circle.fill")
                    .font(.system(size: 28))
                    .foregroundStyle(Theme.Accent.primary)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Propose New Trade")
                        .font(AppFont.titleM)
                        .foregroundStyle(Theme.Text.primary)
                    Text("Pick a team, build the package")
                        .font(AppFont.caption)
                        .foregroundStyle(Theme.Text.secondary)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(Theme.Text.tertiary)
            }
            .padding(Theme.Spacing.md)
            .background(
                LinearGradient(
                    colors: [Theme.BG.card, Theme.BG.elevated],
                    startPoint: .leading, endPoint: .trailing
                ),
                in: RoundedRectangle(cornerRadius: Theme.Radius.large, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.large, style: .continuous)
                    .strokeBorder(Theme.Accent.primary.opacity(0.25), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .disabled(myTeam == nil)
        .opacity(myTeam == nil ? 0.5 : 1)
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "tray")
                .font(.system(size: 48))
                .foregroundStyle(Theme.Text.tertiary)
            Text("No trades yet").font(AppFont.titleM)
            Text("Be the first to start a deal.")
                .font(AppFont.caption)
                .foregroundStyle(Theme.Text.secondary)
        }
        .padding(.top, 64)
        .frame(maxWidth: .infinity)
    }

    private func tradeList(_ list: [LeagueRepository.TradeWithTeams]) -> some View {
        VStack(spacing: 0) {
            ForEach(list) { trade in
                TradeRow(trade: trade, myTeamId: myTeam?.id)
                if trade.id != list.last?.id {
                    Divider().background(Theme.BG.divider).padding(.leading, Theme.Spacing.lg)
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
    }

    private var pending: [LeagueRepository.TradeWithTeams] {
        trades.filter { $0.status == .proposed || $0.status == .luxtaxPending }
    }
    private var completed: [LeagueRepository.TradeWithTeams] {
        trades.filter { $0.status != .proposed && $0.status != .luxtaxPending }
    }

    private func load() async {
        error = nil
        async let teamsTask = LeagueRepository.shared.fetchTeamsWithRosters()
        do {
            let teams = try await teamsTask
            self.allTeams = teams
            if let myEmail = supabase.session?.user.email?.lowercased() {
                self.myTeam = teams.first { $0.owner.email.lowercased() == myEmail }
            }
            if let myId = self.myTeam?.id {
                self.trades = try await LeagueRepository.shared.fetchTrades(forTeam: myId)
            }
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }
}

// MARK: - Trade row

private struct TradeRow: View {
    let trade: LeagueRepository.TradeWithTeams
    let myTeamId: UUID?

    var body: some View {
        HStack(spacing: Theme.Spacing.md) {
            statusDot
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(directionLabel)
                        .font(AppFont.eyebrow)
                        .tracking(1.0)
                        .foregroundStyle(Theme.Text.tertiary)
                    Spacer()
                    Text(statusBadge)
                        .font(.system(size: 9, weight: .heavy))
                        .tracking(0.6)
                        .foregroundStyle(statusColor)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(statusColor.opacity(0.15), in: Capsule())
                }
                Text(headline)
                    .font(AppFont.rowStrong)
                    .foregroundStyle(Theme.Text.primary)
                    .lineLimit(2)
                Text(trade.proposedAt, format: .relative(presentation: .named))
                    .font(AppFont.caption)
                    .foregroundStyle(Theme.Text.tertiary)
            }
        }
        .padding(Theme.Spacing.md)
    }

    private var statusDot: some View {
        Circle()
            .fill(statusColor)
            .frame(width: 8, height: 8)
            .padding(.top, 2)
    }

    private var headline: String {
        let proposer = trade.proposingTeam.owner.fullName
        let receiver = trade.receivingTeam.owner.fullName
        return "\(proposer) → \(receiver)"
    }

    private var directionLabel: String {
        guard let myId = myTeamId else { return "TRADE" }
        if trade.proposedBy == myId { return "OUTGOING" }
        if trade.proposedTo == myId { return "INCOMING" }
        return "TRADE"
    }

    private var statusBadge: String {
        switch trade.status {
        case .proposed: return "PENDING"
        case .accepted: return "ACCEPTED"
        case .rejected: return "REJECTED"
        case .cancelled: return "CANCELLED"
        case .expired: return "EXPIRED"
        case .luxtaxPending: return "LUX TAX 24H"
        case .voided: return "VOIDED"
        }
    }

    private var statusColor: Color {
        switch trade.status {
        case .proposed: return Theme.Status.warn
        case .accepted: return Theme.Status.safe
        case .rejected, .voided, .expired: return Theme.Status.over
        case .cancelled: return Theme.Text.tertiary
        case .luxtaxPending: return Theme.Status.over
        }
    }
}
