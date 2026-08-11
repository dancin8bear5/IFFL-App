import SwiftUI
import SwiftData

struct GameEditorView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss

    let trip: Trip
    /// nil = new game; non-nil = editing an existing game.
    var game: Game?

    @State private var name: String
    @State private var date: Date
    @State private var buyIn: Int
    @State private var selected: Set<PersistentIdentifier>
    @State private var winnerID: PersistentIdentifier?
    @State private var manualMode: Bool
    @State private var payouts: [PersistentIdentifier: Int]

    init(trip: Trip, game: Game? = nil) {
        self.trip = trip
        self.game = game

        if let game {
            _name = State(initialValue: game.name)
            _date = State(initialValue: game.date)
            _buyIn = State(initialValue: game.buyIn)
            let ids = Set(game.lines.compactMap { $0.player?.persistentModelID })
            _selected = State(initialValue: ids)
            _winnerID = State(initialValue: game.winnerLine?.player?.persistentModelID)

            var pay: [PersistentIdentifier: Int] = [:]
            for line in game.lines {
                if let pid = line.player?.persistentModelID { pay[pid] = line.payout }
            }
            _payouts = State(initialValue: pay)

            // If the saved game isn't a clean winner-takes-all, open in manual mode.
            let winners = game.lines.filter { $0.payout > 0 }
            let cleanWTA = winners.count == 1 && game.lines.allSatisfy { $0.contribution == game.buyIn }
            _manualMode = State(initialValue: !cleanWTA)
        } else {
            _name = State(initialValue: "")
            _date = State(initialValue: .now)
            _buyIn = State(initialValue: trip.defaultBuyIn)
            _selected = State(initialValue: [])
            _winnerID = State(initialValue: nil)
            _manualMode = State(initialValue: false)
            _payouts = State(initialValue: [:])
        }
    }

    private var players: [Player] { trip.sortedPlayers }
    private var selectedPlayers: [Player] { players.filter { selected.contains($0.persistentModelID) } }
    private var pot: Int { buyIn * selected.count }
    private var totalPayout: Int { selectedPlayers.reduce(0) { $0 + (payouts[$1.persistentModelID] ?? 0) } }
    private var balanceDelta: Int { totalPayout - pot }

    private var canSave: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty &&
        selected.count >= 2 &&
        (manualMode ? balanceDelta == 0 : winnerID != nil)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Game") {
                    TextField("Name (e.g. Yahtzee)", text: $name)
                    DatePicker("Time", selection: $date)
                    Stepper(value: $buyIn, in: 0...100_000, step: 5) {
                        HStack {
                            Text("Buy-in")
                            Spacer()
                            Text(buyIn.asDollars).foregroundStyle(Color.suGold)
                        }
                    }
                }

                Section {
                    ForEach(players) { player in
                        Button {
                            toggle(player)
                        } label: {
                            HStack {
                                Image(systemName: selected.contains(player.persistentModelID) ? "checkmark.circle.fill" : "circle")
                                    .foregroundStyle(selected.contains(player.persistentModelID) ? Color.suAccent : Color.suSubtext)
                                Text(player.name).foregroundStyle(Color.suText)
                                Spacer()
                            }
                        }
                    }
                } header: {
                    Text("Who played  ·  pot \(pot.asDollars)")
                }

                if selected.count >= 2 {
                    if manualMode {
                        manualPayoutSection
                    } else {
                        winnerSection
                    }

                    Section {
                        Toggle("Split the pot / edit amounts", isOn: $manualMode)
                            .onChange(of: manualMode) { _, on in
                                if on { seedManualPayouts() }
                            }
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Color.suBg)
            .navigationTitle(game == nil ? "New Game" : "Edit Game")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }.disabled(!canSave)
                }
            }
        }
        .tint(.suAccent)
    }

    // MARK: Winner-takes-all

    private var winnerSection: some View {
        Section("Winner (takes the whole pot)") {
            ForEach(selectedPlayers) { player in
                Button {
                    winnerID = player.persistentModelID
                } label: {
                    HStack {
                        Image(systemName: winnerID == player.persistentModelID ? "crown.fill" : "crown")
                            .foregroundStyle(winnerID == player.persistentModelID ? Color.suGold : Color.suSubtext)
                        Text(player.name).foregroundStyle(Color.suText)
                        Spacer()
                        if winnerID == player.persistentModelID {
                            Text(pot.asSignedDollars).foregroundStyle(Color.suPositive)
                        }
                    }
                }
            }
        }
    }

    // MARK: Manual override

    private var manualPayoutSection: some View {
        Section {
            ForEach(selectedPlayers) { player in
                let pid = player.persistentModelID
                HStack {
                    Text(player.name).foregroundStyle(Color.suText)
                    Spacer()
                    Stepper(value: Binding(
                        get: { payouts[pid] ?? 0 },
                        set: { payouts[pid] = max(0, $0) }
                    ), in: 0...1_000_000, step: 5) {
                        Text((payouts[pid] ?? 0).asDollars).foregroundStyle(Color.suGold)
                    }
                    .fixedSize()
                }
            }
        } header: {
            Text("Payouts")
        } footer: {
            HStack {
                if balanceDelta == 0 {
                    Label("Pot balanced", systemImage: "checkmark.circle.fill")
                        .foregroundStyle(Color.suPositive)
                } else {
                    Label("Off by \(abs(balanceDelta).asDollars) \(balanceDelta > 0 ? "over" : "under")",
                          systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(Color.suAccent)
                }
            }
            .font(.caption)
        }
    }

    // MARK: Actions

    private func toggle(_ player: Player) {
        let pid = player.persistentModelID
        if selected.contains(pid) {
            selected.remove(pid)
            payouts[pid] = nil
            if winnerID == pid { winnerID = nil }
        } else {
            selected.insert(pid)
        }
    }

    private func seedManualPayouts() {
        // Pre-fill from the current winner-takes-all choice so editing starts sensibly.
        for player in selectedPlayers {
            let pid = player.persistentModelID
            if payouts[pid] == nil {
                payouts[pid] = (pid == winnerID) ? pot : 0
            }
        }
    }

    private func save() {
        let target: Game
        if let game {
            target = game
            // Clear existing lines; SwiftData cascades the delete.
            for line in game.lines { context.delete(line) }
            target.lines = []
            target.name = name.trimmingCharacters(in: .whitespaces)
            target.date = date
            target.buyIn = buyIn
        } else {
            target = Game(name: name.trimmingCharacters(in: .whitespaces), date: date, buyIn: buyIn, trip: trip)
            context.insert(target)
            trip.games.append(target)
        }

        for player in selectedPlayers {
            let pid = player.persistentModelID
            let payout: Int = manualMode ? (payouts[pid] ?? 0) : (pid == winnerID ? pot : 0)
            let line = GameLine(contribution: buyIn, payout: payout, player: player, game: target)
            context.insert(line)
            target.lines.append(line)
        }

        dismiss()
    }
}
