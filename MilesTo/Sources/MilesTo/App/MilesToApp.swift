import SwiftUI

@main
struct MilesToApp: App {
    @StateObject private var locationManager = LocationManager()
    @StateObject private var routeManager = RouteManager()
    @StateObject private var placesStore = PlacesStore()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(locationManager)
                .environmentObject(routeManager)
                .environmentObject(placesStore)
                .onAppear {
                    locationManager.requestAuthorization()
                }
        }
    }
}
