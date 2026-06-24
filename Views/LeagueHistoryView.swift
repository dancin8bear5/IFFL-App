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
                        .font(.system(size: 48)).foregroundColor(Color.beltSubtext)
                    Text("No history yet")
                        .font(.headline).foregroundColor(Color.beltSubtext)
                    Text("The commissioner can seed league history\nfrom the Admin panel.")
                        .font(.caption).foregroundColor(Color.beltSubtext.opacity(0.7))
                        .multilineTextAlignment(.center)
                    Spacer()
                }
            } else {
                ScrollView {
                    LazyVStack(spacing: 12) {
                        trophyCaseBanner
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

    private var trophyCaseBanner: some View {
        NavigationLink {
            TrophyCaseView().environmentObject(appState)
        } label: {
            HStack(spacing: 14) {
                ZStack {
                    Circle().fill(Color.beltGold.opacity(0.18)).frame(width: 44, height: 44)
                    Image(systemName: "trophy.fill")
                        .font(.system(size: 20)).foregroundColor(Color.beltGold)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text("Trophy Case")
                        .font(.headline).foregroundColor(.white)
                    Text("Career stats, belts & finishes")
                        .font(.caption).foregroundColor(Color.beltSubtext)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption).foregroundColor(Color.beltSubtext)
            }
            .padding()
            .beltCard()
        }
        .buttonStyle(.plain)
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
                        Text(String(entry.season) + " Season")
                            .font(.headline).foregroundColor(.white)
                        HStack(spacing: 6) {
                            Text("🏆").font(.caption)
                            Text(entry.champion)
                                .font(.caption.bold()).foregroundColor(Color.beltGold)
                            if let ru = entry.runnerUp {
                                Text("· 2nd: \(ru)")
                                    .font(.caption).foregroundColor(Color.beltSubtext)
                            }
                        }
                    }
                    Spacer()
                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        .foregroundColor(Color.beltSubtext)
                        .font(.caption)
                }
                .padding()
            }
            .buttonStyle(.plain)

            if isExpanded {
                Divider().background(Color.beltElevated).padding(.horizontal)

                if !entry.standings.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Final Standings")
                            .font(.caption.bold()).foregroundColor(Color.beltSubtext)
                            .padding(.horizontal)

                        ForEach(entry.standings.sorted { $0.place < $1.place }, id: \.teamName) { finish in
                            HStack {
                                Text("\(finish.place).")
                                    .font(.caption.bold())
                                    .foregroundColor(finish.place <= 3 ? Color.beltGold : Color.beltSubtext)
                                    .frame(width: 24, alignment: .leading)
                                Text(finish.teamName)
                                    .font(.caption).foregroundColor(.white)
                                Spacer()
                                if let record = finish.record {
                                    Text(record)
                                        .font(.caption).foregroundColor(Color.beltSubtext)
                                }
                                if let pts = finish.pointsFor {
                                    Text(String(format: "%.1f pts", pts))
                                        .font(.caption2).foregroundColor(Color.beltSubtext)
                                }
                            }
                            .padding(.horizontal)
                        }
                    }
                    .padding(.vertical, 8)
                }

                if let trades = entry.notableTrades, !trades.isEmpty {
                    Divider().background(Color.beltElevated).padding(.horizontal)
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Notable Trades")
                            .font(.caption.bold()).foregroundColor(Color.beltSubtext)
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
        .beltCard()
    }
}
