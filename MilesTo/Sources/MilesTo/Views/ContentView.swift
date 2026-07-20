import SwiftUI

struct ContentView: View {
    @EnvironmentObject var locationManager: LocationManager
    @EnvironmentObject var routeManager: RouteManager
    @EnvironmentObject var placesStore: PlacesStore

    var body: some View {
        TabView {
            DashboardView()
                .tabItem { Label("Dashboard", systemImage: "car.fill") }

            PlacesListView()
                .tabItem { Label("My Places", systemImage: "star.fill") }

            MapRouteView()
                .tabItem { Label("Map", systemImage: "map.fill") }
        }
        .onReceive(locationManager.$currentLocation) { location in
            guard let loc = location else { return }
            routeManager.refreshWaypoints(from: loc, places: placesStore.places)
        }
        .onReceive(locationManager.$lastRefresh) { _ in
            guard let loc = locationManager.currentLocation else { return }
            routeManager.refreshWaypoints(from: loc, places: placesStore.places)
        }
    }
}
