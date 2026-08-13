import SwiftUI

// MARK: - Trophy Case View
// Personal career-stats page for any team, computed entirely from
// appState.leagueHistory (all seeded seasons). Defaults to the user's team
// with a chip switcher to view any owner's trophy case.

struct TrophyCaseView: View {
    @EnvironmentObject var appState: AppState
    @State private var selectedTeam: String = ""

    private let teamNames = fantasyTeams.map { $0.name }

    private var stats: TeamCareerStats {
        TeamCareerStats.compute(team: selectedTeam, from: appState.leagueHistory)
    }

    var body: some View {
        ZStack {
            Color.beltBg.ignoresSafeArea()
            ScrollView {
                VStack(spacing: 16) {
                    teamSwitcher
                    heroCard
                    statGrid
                    if !stats.championshipYears.isEmpty { championshipYearsCard }
                    if !stats.finishes.isEmpty { seasonBySeasonCard }
                }
                .padding()
            }
        }
        .navigationTitle("Trophy Case")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            if selectedTeam.isEmpty {
                selectedTeam = appState.userTeam.isEmpty ? (teamNames.first ?? "") : appState.userTeam
            }
            appState.loadLeagueHistory()
        }
    }

    // MARK: Team Switcher

    private var teamSwitcher: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(teamNames, id: \.self) { name in
                    Button {
                        withAnimation(.easeInOut(duration: 0.15)) { selectedTeam = name }
                    } label: {
                        Text(name)
                            .font(.caption.bold())
                            .foregroundColor(selectedTeam == name ? .white : Color.beltSubtext)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .background(selectedTeam == name ? Color.beltAccent : Color.beltSurface)
                            .clipShape(Capsule())
                    }
                }
            }
            .padding(.horizontal, 2)
        }
    }

    // MARK: Hero

    private var heroCard: some View {
        VStack(spacing: 12) {
            Text(selectedTeam)
                .font(.system(size: 30, weight: .black))
                .foregroundColor(.white)

            if stats.championships > 0 {
                HStack(spacing: 6) {
                    ForEach(0..<stats.championships, id: \.self) { _ in
                        Image(systemName: "trophy.fill")
                            .font(.system(size: 22))
                            .foregroundColor(Color.beltGold)
                    }
                }
                Text("\(stats.championships)× League Champion")
                    .font(.subheadline.bold())
                    .foregroundColor(Color.beltGold)
            } else {
                Image(systemName: "trophy")
                    .font(.system(size: 22))
                    .foregroundColor(Color.beltSubtext.opacity(0.5))
                Text("Still chasing the first belt")
                    .font(.subheadline)
                    .foregroundColor(Color.beltSubtext)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
        .background(
            LinearGradient(
                colors: stats.championships > 0
                    ? [Color.beltGold.opacity(0.18), Color.beltSurface]
                    : [Color.beltSurface, Color.beltSurface],
                startPoint: .top, endPoint: .bottom
            )
        )
        .beltCard()
    }

    // MARK: Stat Grid

    private var statGrid: some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
            statCell("Championships", "\(stats.championships)", icon: "trophy.fill", gold: true)
            statCell("Runner-Ups", "\(stats.runnerUps)", icon: "medal.fill")
            statCell("Reg. Season", stats.recordString, icon: "list.number")
            statCell("Win %", stats.winPctString, icon: "percent")
            statCell("Best Finish", stats.bestFinishString, icon: "arrow.up.circle.fill")
            statCell("Top-3 Finishes", "\(stats.topThreeFinishes)", icon: "star.fill")
            statCell("Seasons Played", "\(stats.seasonsPlayed)", icon: "calendar")
            statCell("Final Appearances", "\(stats.championships + stats.runnerUps)", icon: "flag.checkered")
        }
    }

    private func statCell(_ label: String, _ value: String, icon: String, gold: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.caption)
                    .foregroundColor(gold ? Color.beltGold : Color.beltAccent)
                Text(label)
                    .font(.caption2)
                    .foregroundColor(Color.beltSubtext)
            }
            Text(value)
                .font(.system(size: 22, weight: .bold))
                .foregroundColor(gold && value != "0" ? Color.beltGold : .white)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .beltCard()
    }

    // MARK: Championship Years

    private var championshipYearsCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Championship Years")
                .font(.caption.bold()).foregroundColor(Color.beltSubtext)
            HStack(spacing: 8) {
                ForEach(stats.championshipYears, id: \.self) { year in
                    Text(String(year))
                        .font(.subheadline.bold())
                        .foregroundColor(Color.beltGold)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(Color.beltGold.opacity(0.15))
                        .clipShape(Capsule())
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .beltCard()
    }

    // MARK: Season By Season

    private var seasonBySeasonCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Season by Season")
                .font(.caption.bold()).foregroundColor(Color.beltSubtext)
                .padding(.bottom, 8)
            ForEach(stats.finishes) { finish in
                HStack(spacing: 12) {
                    Text(String(finish.season))
                        .font(.subheadline.monospacedDigit())
                        .foregroundColor(.white)
                        .frame(width: 48, alignment: .leading)

                    placeBadge(finish.place)

                    Spacer()

                    if let record = finish.record {
                        Text(record)
                            .font(.subheadline.monospacedDigit())
                            .foregroundColor(Color.beltSubtext)
                    }
                }
                .padding(.vertical, 8)
                Divider().background(Color.beltElevated)
            }
        }
        .padding()
        .beltCard()
    }

    private func placeBadge(_ place: Int) -> some View {
        let color: Color = place == 1 ? Color.beltGold
            : place == 2 ? Color(white: 0.75)
            : place == 3 ? Color(red: 0.80, green: 0.50, blue: 0.20)
            : Color.beltSubtext
        return HStack(spacing: 4) {
            if place <= 3 {
                Image(systemName: "medal.fill").font(.caption2).foregroundColor(color)
            }
            Text(ordinal(place))
                .font(.caption.bold())
                .foregroundColor(color)
        }
    }

    private func ordinal(_ n: Int) -> String {
        let suffix: String
        switch n % 100 {
        case 11, 12, 13: suffix = "th"
        default:
            switch n % 10 {
            case 1: suffix = "st"
            case 2: suffix = "nd"
            case 3: suffix = "rd"
            default: suffix = "th"
            }
        }
        return "\(n)\(suffix)"
    }
}

// MARK: - Career Stats (computed from SeasonHistory)

struct SeasonFinish: Identifiable {
    var id: Int { season }
    let season: Int
    let place: Int
    let record: String?
}

struct TeamCareerStats {
    let teamName: String
    let championships: Int
    let championshipYears: [Int]
    let runnerUps: Int
    let wins: Int
    let losses: Int
    let seasonsPlayed: Int
    let bestFinish: Int?
    let topThreeFinishes: Int
    /// Final place + regular-season record per season, sorted newest-first
    let finishes: [SeasonFinish]

    var winPct: Double { (wins + losses) == 0 ? 0 : Double(wins) / Double(wins + losses) }
    var winPctString: String {
        (wins + losses) == 0 ? "—" : String(format: "%.1f%%", winPct * 100)
    }
    var recordString: String { "\(wins)-\(losses)" }
    var bestFinishString: String {
        guard let b = bestFinish else { return "—" }
        return b == 1 ? "1st 🏆" : "\(b)\(ordinalSuffix(b))"
    }

    private func ordinalSuffix(_ n: Int) -> String {
        switch n % 100 {
        case 11, 12, 13: return "th"
        default:
            switch n % 10 {
            case 1: return "st"
            case 2: return "nd"
            case 3: return "rd"
            default: return "th"
            }
        }
    }

    static func compute(team: String, from history: [SeasonHistory]) -> TeamCareerStats {
        var champYears: [Int] = []
        var runnerUps = 0
        var wins = 0, losses = 0, seasons = 0, topThree = 0
        var best: Int? = nil
        var finishes: [SeasonFinish] = []

        for season in history {
            if season.champion == team { champYears.append(season.season) }
            if season.runnerUp == team { runnerUps += 1 }
            if let finish = season.standings.first(where: { $0.teamName == team }) {
                seasons += 1
                if finish.place <= 3 { topThree += 1 }
                if best == nil || finish.place < best! { best = finish.place }
                finishes.append(SeasonFinish(season: season.season, place: finish.place, record: finish.record))
                if let rec = finish.record {
                    let parts = rec.split(separator: "-").compactMap { Int($0) }
                    if parts.count >= 2 { wins += parts[0]; losses += parts[1] }
                }
            }
        }

        return TeamCareerStats(
            teamName: team,
            championships: champYears.count,
            championshipYears: champYears.sorted(),
            runnerUps: runnerUps,
            wins: wins,
            losses: losses,
            seasonsPlayed: seasons,
            bestFinish: best,
            topThreeFinishes: topThree,
            finishes: finishes.sorted { $0.season > $1.season }
        )
    }
}
