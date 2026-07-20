import SwiftUI

struct PlaceDetailView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var placesStore: PlacesStore

    @State private var place: SavedPlace
    var isNewPlace: Bool = false
    var onSave: (() -> Void)? = nil

    init(place: SavedPlace, isNewPlace: Bool = false, onSave: (() -> Void)? = nil) {
        _place = State(initialValue: place)
        self.isNewPlace = isNewPlace
        self.onSave = onSave
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Place Info") {
                    TextField("Name", text: $place.name)
                    TextField("Address / subtitle", text: $place.subtitle)
                }

                Section("Category") {
                    Picker("Category", selection: $place.category) {
                        ForEach(PlaceCategory.allCases) { cat in
                            Label(cat.rawValue, systemImage: cat.icon).tag(cat)
                        }
                    }
                    .pickerStyle(.segmented)
                }

                Section("Options") {
                    Toggle("Show on Dashboard", isOn: $place.isEnabled)
                    TextField("Notes (optional)", text: $place.notes, axis: .vertical)
                        .lineLimit(3...6)
                }

                if !isNewPlace {
                    Section {
                        Button(role: .destructive) {
                            placesStore.delete(place)
                            dismiss()
                        } label: {
                            Label("Remove Place", systemImage: "trash")
                        }
                    }
                }
            }
            .navigationTitle(isNewPlace ? "Add Place" : place.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if isNewPlace {
                    ToolbarItem(placement: .topBarLeading) {
                        Button("Cancel") { dismiss() }
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button(isNewPlace ? "Add" : "Done") {
                        if isNewPlace {
                            placesStore.add(place)
                            onSave?()
                        } else {
                            placesStore.update(place)
                        }
                        dismiss()
                    }
                    .fontWeight(.semibold)
                    .disabled(place.name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }
}
