import SwiftUI
import MapKit

struct PlaceSearchView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var locationManager: LocationManager
    @EnvironmentObject var placesStore: PlacesStore

    @State private var searchText = ""
    @State private var results: [MKMapItem] = []
    @State private var isSearching = false
    @State private var pendingPlace: SavedPlace?

    var body: some View {
        NavigationStack {
            List {
                if isSearching {
                    HStack {
                        Spacer()
                        ProgressView("Searching…")
                        Spacer()
                    }
                    .listRowBackground(Color.clear)
                }

                ForEach(results, id: \.self) { item in
                    Button {
                        buildPendingPlace(from: item)
                    } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.name ?? "Unknown")
                                .font(.body)
                                .foregroundStyle(.primary)
                            if let addr = item.placemark.title {
                                Text(addr)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            .overlay {
                if !isSearching && results.isEmpty && searchText.isEmpty {
                    ContentUnavailableView(
                        "Search for a Place",
                        systemImage: "magnifyingglass",
                        description: Text("Search for gas stations, restaurants, or any location to add.")
                    )
                } else if !isSearching && results.isEmpty && !searchText.isEmpty {
                    ContentUnavailableView.search(text: searchText)
                }
            }
            .navigationTitle("Add Place")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
            }
            .searchable(
                text: $searchText,
                placement: .navigationBarDrawer(displayMode: .always),
                prompt: "Gas station, restaurant, address…"
            )
            .onSubmit(of: .search) {
                Task { await search() }
            }
            .onChange(of: searchText) { _, newValue in
                if newValue.isEmpty { results = [] }
            }
            .sheet(item: $pendingPlace) { place in
                PlaceDetailView(place: place, isNewPlace: true) {
                    dismiss()
                }
            }
        }
    }

    private func buildPendingPlace(from item: MKMapItem) {
        guard let coord = item.placemark.location?.coordinate else { return }
        pendingPlace = SavedPlace(
            name: item.name ?? "Unknown",
            subtitle: item.placemark.title ?? "",
            latitude: coord.latitude,
            longitude: coord.longitude,
            category: inferCategory(from: item)
        )
    }

    private func inferCategory(from item: MKMapItem) -> PlaceCategory {
        guard let cat = item.pointOfInterestCategory else { return .other }
        if cat == .gasStation { return .gas }
        if [MKPointOfInterestCategory.restaurant,
            .cafe,
            .bakery,
            .brewery,
            .foodMarket].contains(cat) { return .food }
        return .other
    }

    private func search() async {
        guard !searchText.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        isSearching = true

        let region: MKCoordinateRegion
        if let loc = locationManager.currentLocation {
            region = MKCoordinateRegion(
                center: loc.coordinate,
                span: MKCoordinateSpan(latitudeDelta: 2, longitudeDelta: 2)
            )
        } else {
            region = MKCoordinateRegion(MKMapRect.world)
        }

        results = await placesStore.search(query: searchText, near: region)
        isSearching = false
    }
}
