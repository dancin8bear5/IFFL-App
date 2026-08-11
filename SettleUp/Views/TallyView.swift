import SwiftUI

struct TallyView: View {
    let trip: Trip

    /// (name, net) sorted from biggest winner to biggest loser.
    private var standings: [(name: String, net: Int)] {
        let balances = SettlementEngine.netBalances(from: lineTuples(for: trip))
        // Include every player, even those with zero net or no games played.
        var all: [String: Int] = balances
        for p in trip.players where all[p.name] == nil { all[p.name] = 0 }
        return all
            .map { (name: $0.key, net: $0.value) }
            .sorted { $0.net != $1.net ? $0.net > $1.net : $0.name < $1.name }
    }

    var body: some View {
        if trip.players.isEmpty {
            centeredHint("Add players to see the tally.")
        } else {
            List {
                Section {
                    ForEach(standings, id: \.name) { row in
                        HStack {
                            Text(row.name).foregroundStyle(Color.suText)
                            Spacer()
                            Text(row.net.asSignedDollars)
                                .font(.body.monospacedDigit().weight(.semibold))
                                .foregroundStyle(color(for: row.net))
                        }
                        .listRowBackground(Color.suSurface)
                    }
                } footer: {
                    Text("Positive = they are owed money. Negative = they owe.")
                        .foregroundStyle(Color.suSubtext)
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
        }
    }

    private func color(for net: Int) -> Color {
        if net > 0 { return .suPositive }
        if net < 0 { return .suAccent }
        return .suSubtext
    }

    private func centeredHint(_ text: String) -> some View {
        Text(text)
            .foregroundStyle(Color.suSubtext)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Shared bridge from SwiftData → engine tuples

/// Flatten a trip's games into the `(name, contribution, payout)` tuples the
/// Firebase-free `SettlementEngine` consumes. Kept free of view state so both
/// TallyView and SettleUpView share one source of truth.
func lineTuples(for trip: Trip) -> [(name: String, contribution: Int, payout: Int)] {
    trip.games.flatMap { game in
        game.lines.compactMap { line -> (name: String, contribution: Int, payout: Int)? in
            guard let name = line.player?.name else { return nil }
            return (name: name, contribution: line.contribution, payout: line.payout)
        }
    }
}
