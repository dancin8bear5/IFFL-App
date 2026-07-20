import SwiftUI

struct PlacesListView: View {
    @EnvironmentObject var placesStore: PlacesStore

    @State private var selectedCategory: PlaceCategory? = nil
    @State private var showSearch = false

    var filteredPlaces: [SavedPlace] {
        guard let cat = selectedCategory else { return placesStore.places }
        return placesStore.places.filter { $0.category == cat }
    }

    var body: some View {
        NavigationStack {
            Group {
                if placesStore.places.isEmpty {
                    emptyState
                } else {
                    List {
                        categoryPicker

                        ForEach(filteredPlaces) { place in
                            NavigationLink {
                                PlaceDetailView(place: place)
                            } label: {
                                PlaceRowView(place: place)
                            }
                            .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                Button(role: .destructive) {
                                    placesStore.delete(place)
                                } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                            }
                            .swipeActions(edge: .leading) {
                                Button {
                                    placesStore.toggle(place)
                                } label: {
                                    Label(
                                        place.isEnabled ? "Disable" : "Enable",
                                        systemImage: place.isEnabled ? "eye.slash" : "eye"
                                    )
                                }
                                .tint(place.isEnabled ? .gray : .green)
                            }
                        }
                    }
                    .listStyle(.insetGrouped)
                }
            }
            .navigationTitle("My Places")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showSearch = true } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showSearch) {
                PlaceSearchView()
            }
        }
    }

    private var categoryPicker: some View {
        Section {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    CategoryChip(title: "All", isSelected: selectedCategory == nil) {
                        selectedCategory = nil
                    }
                    ForEach(PlaceCategory.allCases) { cat in
                        CategoryChip(
                            title: cat.rawValue,
                            icon: cat.icon,
                            isSelected: selectedCategory == cat
                        ) {
                            selectedCategory = selectedCategory == cat ? nil : cat
                        }
                    }
                }
                .padding(.vertical, 4)
            }
        }
        .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 16))
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: "star.slash")
                .font(.system(size: 52))
                .foregroundStyle(.secondary)
            Text("No saved places yet")
                .font(.title3.weight(.semibold))
            Text("Tap + to search for and save your favorite gas stations, restaurants, and more.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 48)
            Button { showSearch = true } label: {
                Label("Add a Place", systemImage: "plus")
                    .padding(.horizontal, 24)
                    .padding(.vertical, 10)
                    .background(Color.blue)
                    .foregroundStyle(.white)
                    .clipShape(Capsule())
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Place Row

struct PlaceRowView: View {
    let place: SavedPlace

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: place.category.icon)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(categoryColor)
                .frame(width: 32, height: 32)
                .background(categoryColor.opacity(0.15))
                .clipShape(RoundedRectangle(cornerRadius: 8))

            VStack(alignment: .leading, spacing: 2) {
                Text(place.name)
                    .font(.body)
                    .foregroundStyle(place.isEnabled ? .primary : .secondary)
                Text(place.subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer()

            if !place.isEnabled {
                Text("Off")
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Color(.systemGray5))
                    .clipShape(Capsule())
            }
        }
    }

    private var categoryColor: Color {
        switch place.category {
        case .gas:   return .orange
        case .food:  return .red
        case .other: return .blue
        }
    }
}

// MARK: - Category Chip

struct CategoryChip: View {
    let title: String
    var icon: String? = nil
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 4) {
                if let icon {
                    Image(systemName: icon)
                        .font(.caption)
                }
                Text(title)
                    .font(.subheadline.weight(isSelected ? .semibold : .regular))
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(isSelected ? Color.blue : Color(.systemGray5))
            .foregroundStyle(isSelected ? .white : .primary)
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}
