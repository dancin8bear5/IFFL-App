import SwiftUI
import MapKit

struct DestinationSearchView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var locationManager: LocationManager
    @EnvironmentObject var routeManager: RouteManager

    @State private var searchText = ""
    @State private var results: [MKMapItem] = []
    @State private var isSearching = false

    var body: some View {
        NavigationStack {
            List {
                if routeManager.currentRoute != nil {
                    Section {
                        Button(role: .destructive) {
                            routeManager.clearRoute()
                            dismiss()
                        } label: {
                            Label("Clear Route", systemImage: "xmark.circle")
                        }
                    }
                }

                if isSearching {
                    Section {
                        HStack {
                            Spacer()
                            ProgressView("Searching…")
                            Spacer()
                        }
                    }
                }

                if !results.isEmpty {
                    Section("Results") {
                        ForEach(results, id: \.self) { item in
                            Button {
                                selectDestination(item)
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
                }
            }
            .navigationTitle("Set Destination")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
            }
            .searchable(
                text: $searchText,
                placement: .navigationBarDrawer(displayMode: .always),
                prompt: "City, address, or place name"
            )
            .onSubmit(of: .search) {
                Task { await performSearch() }
            }
            .onChange(of: searchText) { _, newValue in
                if newValue.isEmpty { results = [] }
            }
        }
    }

    private func selectDestination(_ item: MKMapItem) {
        dismiss()
        Task { await routeManager.setDestination(item) }
    }

    private func performSearch() async {
        guard !searchText.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        isSearching = true

        let request = MKLocalSearch.Request()
        request.naturalLanguageQuery = searchText
        if let loc = locationManager.currentLocation {
            request.region = MKCoordinateRegion(
                center: loc.coordinate,
                span: MKCoordinateSpan(latitudeDelta: 10, longitudeDelta: 10)
            )
        }

        do {
            let search = MKLocalSearch(request: request)
            let response = try await search.start()
            results = response.mapItems
        } catch {
            results = []
        }
        isSearching = false
    }
}
