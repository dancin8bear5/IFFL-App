import Foundation
import MapKit

class PlacesStore: ObservableObject {
    @Published var places: [SavedPlace] = []

    private let storageKey = "milesto_saved_places_v1"

    init() {
        load()
    }

    func add(_ place: SavedPlace) {
        places.append(place)
        save()
    }

    func update(_ place: SavedPlace) {
        if let idx = places.firstIndex(where: { $0.id == place.id }) {
            places[idx] = place
            save()
        }
    }

    func delete(_ place: SavedPlace) {
        places.removeAll { $0.id == place.id }
        save()
    }

    func toggle(_ place: SavedPlace) {
        if let idx = places.firstIndex(where: { $0.id == place.id }) {
            places[idx].isEnabled.toggle()
            save()
        }
    }

    func search(query: String, near region: MKCoordinateRegion) async -> [MKMapItem] {
        let request = MKLocalSearch.Request()
        request.naturalLanguageQuery = query
        request.region = region
        do {
            let search = MKLocalSearch(request: request)
            let response = try await search.start()
            return response.mapItems
        } catch {
            return []
        }
    }

    private func save() {
        if let data = try? JSONEncoder().encode(places) {
            UserDefaults.standard.set(data, forKey: storageKey)
        }
    }

    private func load() {
        guard let data = UserDefaults.standard.data(forKey: storageKey),
              let decoded = try? JSONDecoder().decode([SavedPlace].self, from: data) else { return }
        places = decoded
    }
}
