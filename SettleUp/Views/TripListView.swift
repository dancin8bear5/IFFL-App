import SwiftUI
import SwiftData

struct TripListView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \Trip.date, order: .reverse) private var trips: [Trip]

    @State private var showingNewTrip = false

    var body: some View {
        NavigationStack {
            ZStack {
                Color.suBg.ignoresSafeArea()

                if trips.isEmpty {
                    emptyState
                } else {
                    List {
                        ForEach(trips) { trip in
                            NavigationLink(value: trip) {
                                TripRow(trip: trip)
                            }
                            .listRowBackground(Color.suSurface)
                        }
                        .onDelete(perform: deleteTrips)
                    }
                    .listStyle(.plain)
                    .scrollContentBackground(.hidden)
                }
            }
            .navigationTitle("Trips")
            .navigationDestination(for: Trip.self) { trip in
                TripDetailView(trip: trip)
            }
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        showingNewTrip = true
                    } label: {
                        Image(systemName: "plus")
                    }
                    .tint(.suAccent)
                }
            }
            .sheet(isPresented: $showingNewTrip) {
                TripEditorView()
            }
        }
        .tint(.suAccent)
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: "dice.fill")
                .font(.system(size: 52))
                .foregroundStyle(Color.suAccent)
            Text("No trips yet")
                .font(.title2.bold())
                .foregroundStyle(Color.suText)
            Text("Create a trip, add the people, and start logging games.")
                .font(.subheadline)
                .foregroundStyle(Color.suSubtext)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
            Button("New Trip") { showingNewTrip = true }
                .buttonStyle(.borderedProminent)
                .tint(.suAccent)
        }
    }

    private func deleteTrips(_ offsets: IndexSet) {
        for index in offsets {
            context.delete(trips[index])
        }
    }
}

private struct TripRow: View {
    let trip: Trip

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(trip.name)
                .font(.headline)
                .foregroundStyle(Color.suText)
            HStack(spacing: 8) {
                Text(trip.date, format: .dateTime.month().day().year())
                Text("·")
                Text("\(trip.players.count) players")
                Text("·")
                Text("\(trip.games.count) games")
            }
            .font(.caption)
            .foregroundStyle(Color.suSubtext)
        }
        .padding(.vertical, 4)
    }
}

// MARK: - New / edit trip

struct TripEditorView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss

    /// nil = creating a new trip; non-nil = editing.
    var trip: Trip?

    @State private var name: String = ""
    @State private var buyIn: Int = 50
    @State private var date: Date = .now

    init(trip: Trip? = nil) {
        self.trip = trip
        _name = State(initialValue: trip?.name ?? "")
        _buyIn = State(initialValue: trip?.defaultBuyIn ?? 50)
        _date = State(initialValue: trip?.date ?? .now)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Trip") {
                    TextField("Name (e.g. Lake Weekend)", text: $name)
                    DatePicker("Date", selection: $date, displayedComponents: .date)
                }
                Section("Default buy-in") {
                    Stepper(value: $buyIn, in: 0...100_000, step: 5) {
                        Text(buyIn.asDollars).foregroundStyle(Color.suGold)
                    }
                    Text("New games start at this buy-in. You can change it per game.")
                        .font(.caption)
                        .foregroundStyle(Color.suSubtext)
                }
            }
            .scrollContentBackground(.hidden)
            .background(Color.suBg)
            .navigationTitle(trip == nil ? "New Trip" : "Edit Trip")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }
                        .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
        .tint(.suAccent)
    }

    private func save() {
        let clean = name.trimmingCharacters(in: .whitespaces)
        if let trip {
            trip.name = clean
            trip.defaultBuyIn = buyIn
            trip.date = date
        } else {
            let newTrip = Trip(name: clean, date: date, defaultBuyIn: buyIn)
            context.insert(newTrip)
        }
        dismiss()
    }
}
