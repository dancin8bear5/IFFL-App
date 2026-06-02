import SwiftUI

// MARK: - League History View

struct LeagueHistoryView: View {
    @EnvironmentObject var appState: AppState
    @State private var expandedSeason: Int? = nil

    var body: some View {
        Group {
            if appState.leagueHistory.isEmpty {
                VStack(spacing: 16) {
                    Spacer()
                    Image(systemName: "clock.arrow.circlepath")
                        .font(.system(size: 48)).foregroundColor(Color.iffSubtext)
                    Text("No history yet")
                        .font(.headline).foregroundColor(Color.iffSubtext)
                    Text("The commissioner can seed league history\nfrom the Admin panel.")
                        .font(.caption).foregroundColor(Color.iffSubtext.opacity(0.7))
                        .multilineTextAlignment(.center)
                    Spacer()
                }
            } else {
                ScrollView {
                    LazyVStack(spacing: 12) {
                        ForEach(appState.leagueHistory) { entry in
                            SeasonHistoryCard(
                                entry: entry,
                                isExpanded: expandedSeason == entry.season
                            ) {
                                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                    expandedSeason = expandedSeason == entry.season ? nil : entry.season
                                }
                            }
                        }
                    }
                    .padding()
                }
            }
        }
        .onAppear { appState.loadLeagueHistory() }
    }
}

// MARK: - Season History Card

struct SeasonHistoryCard: View {
    let entry: SeasonHistory
    let isExpanded: Bool
    let onTap: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button(action: onTap) {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("\(entry.season) Season")
                            .font(.headline).foregroundColor(.white)
                        HStack(spacing: 6) {
                            Text("🏆").font(.caption)
                            Text(entry.champion)
                                .font(.caption.bold()).foregroundColor(Color.iffGold)
                            if let ru = entry.runnerUp {
                                Text("· 2nd: \(ru)")
                                    .font(.caption).foregroundColor(Color.iffSubtext)
                            }
                        }
                    }
                    Spacer()
                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        .foregroundColor(Color.iffSubtext)
                        .font(.caption)
                }
                .padding()
            }
            .buttonStyle(.plain)

            if isExpanded {
                Divider().background(Color.iffElevated).padding(.horizontal)

                if !entry.standings.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Final Standings")
                            .font(.caption.bold()).foregroundColor(Color.iffSubtext)
                            .padding(.horizontal)

                        ForEach(entry.standings.sorted { $0.place < $1.place }, id: \.teamName) { finish in
                            HStack {
                                Text("\(finish.place).")
                                    .font(.caption.bold())
                                    .foregroundColor(finish.place <= 3 ? Color.iffGold : Color.iffSubtext)
                                    .frame(width: 24, alignment: .leading)
                                Text(finish.teamName)
                                    .font(.caption).foregroundColor(.white)
                                Spacer()
                                if let record = finish.record {
                                    Text(record)
                                        .font(.caption).foregroundColor(Color.iffSubtext)
                                }
                                if let pts = finish.pointsFor {
                                    Text(String(format: "%.1f pts", pts))
                                        .font(.caption2).foregroundColor(Color.iffSubtext)
                                }
                            }
                            .padding(.horizontal)
                        }
                    }
                    .padding(.vertical, 8)
                }

                if let trades = entry.notableTrades, !trades.isEmpty {
                    Divider().background(Color.iffElevated).padding(.horizontal)
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Notable Trades")
                            .font(.caption.bold()).foregroundColor(Color.iffSubtext)
                        ForEach(trades, id: \.self) { note in
                            Text("• \(note)")
                                .font(.caption).foregroundColor(.white)
                        }
                    }
                    .padding(.horizontal)
                    .padding(.vertical, 8)
                }
            }
        }
        .iffCard()
    }
}
