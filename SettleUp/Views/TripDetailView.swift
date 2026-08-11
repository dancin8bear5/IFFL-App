import SwiftUI
import SwiftData

struct TripDetailView: View {
    @Bindable var trip: Trip

    enum Section: String, CaseIterable, Identifiable {
        case players = "Players"
        case games = "Games"
        case tally = "Tally"
        case settle = "Settle Up"
        var id: String { rawValue }
    }

    @State private var section: Section = .games

    var body: some View {
        ZStack {
            Color.suBg.ignoresSafeArea()

            VStack(spacing: 0) {
                Picker("Section", selection: $section) {
                    ForEach(Section.allCases) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal)
                .padding(.top, 8)

                Divider().overlay(Color.suElevated)

                switch section {
                case .players: PlayersSection(trip: trip)
                case .games:   GamesSection(trip: trip)
                case .tally:   TallyView(trip: trip)
                case .settle:  SettleUpView(trip: trip)
                }
            }
        }
        .navigationTitle(trip.name)
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Players section

private struct PlayersSection: View {
    @Environment(\.modelContext) private var context
    @Bindable var trip: Trip

    @State private var newName: String = ""

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                TextField("Add a person…", text: $newName)
                    .textInputAutocapitalization(.words)
                    .submitLabel(.done)
                    .onSubmit(addPlayer)
                Button(action: addPlayer) {
                    Image(systemName: "plus.circle.fill")
                        .font(.title2)
                        .foregroundStyle(Color.suAccent)
                }
                .disabled(newName.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            .padding()

            if trip.players.isEmpty {
                Spacer()
                Text("Add everyone on the trip.")
                    .foregroundStyle(Color.suSubtext)
                Spacer()
            } else {
                List {
                    ForEach(trip.sortedPlayers) { player in
                        Text(player.name)
                            .foregroundStyle(Color.suText)
                            .listRowBackground(Color.suSurface)
                    }
                    .onDelete(perform: deletePlayers)
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
            }
        }
    }

    private func addPlayer() {
        let clean = newName.trimmingCharacters(in: .whitespaces)
        guard !clean.isEmpty else { return }
        let player = Player(name: clean, trip: trip)
        context.insert(player)
        trip.players.append(player)
        newName = ""
    }

    private func deletePlayers(_ offsets: IndexSet) {
        let sorted = trip.sortedPlayers
        for index in offsets {
            context.delete(sorted[index])
        }
    }
}

// MARK: - Games section

private struct GamesSection: View {
    @Environment(\.modelContext) private var context
    @Bindable var trip: Trip

    @State private var showingNewGame = false
    @State private var editingGame: Game?

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            if trip.games.isEmpty {
                VStack(spacing: 8) {
                    Text(trip.players.isEmpty ? "Add players first." : "No games yet.")
                        .foregroundStyle(Color.suSubtext)
                    if !trip.players.isEmpty {
                        Text("Tap + to log the first game.")
                            .font(.caption)
                            .foregroundStyle(Color.suSubtext)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List {
                    ForEach(trip.sortedGames) { game in
                        Button {
                            editingGame = game
                        } label: {
                            GameRow(game: game)
                        }
                        .listRowBackground(Color.suSurface)
                    }
                    .onDelete(perform: deleteGames)
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
            }

            Button {
                showingNewGame = true
            } label: {
                Image(systemName: "plus")
                    .font(.title2.bold())
                    .foregroundStyle(.white)
                    .frame(width: 56, height: 56)
                    .background(Color.suAccent)
                    .clipShape(Circle())
                    .shadow(radius: 4, y: 2)
            }
            .padding()
            .disabled(trip.players.isEmpty)
            .opacity(trip.players.isEmpty ? 0.4 : 1)
        }
        .sheet(isPresented: $showingNewGame) {
            GameEditorView(trip: trip)
        }
        .sheet(item: $editingGame) { game in
            GameEditorView(trip: trip, game: game)
        }
    }

    private func deleteGames(_ offsets: IndexSet) {
        let sorted = trip.sortedGames
        for index in offsets {
            context.delete(sorted[index])
        }
    }
}

private struct GameRow: View {
    let game: Game

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(game.name)
                    .font(.headline)
                    .foregroundStyle(Color.suText)
                Spacer()
                Text(game.pot.asDollars)
                    .font(.subheadline.bold())
                    .foregroundStyle(Color.suGold)
            }
            HStack(spacing: 6) {
                Text(game.date, format: .dateTime.hour().minute())
                Text("·")
                Text("\(game.lines.count) players")
                if let w = game.winnerLine?.player?.name {
                    Text("·")
                    Image(systemName: "crown.fill").foregroundStyle(Color.suGold)
                    Text(w)
                }
                if !game.isBalanced {
                    Text("·")
                    Text("unbalanced")
                        .foregroundStyle(Color.suAccent)
                }
            }
            .font(.caption)
            .foregroundStyle(Color.suSubtext)
        }
        .padding(.vertical, 4)
    }
}
