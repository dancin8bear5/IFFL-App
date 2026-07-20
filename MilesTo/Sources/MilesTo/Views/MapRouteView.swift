import SwiftUI
import MapKit

struct MapRouteView: View {
    @EnvironmentObject var routeManager: RouteManager
    @EnvironmentObject var placesStore: PlacesStore

    @State private var position: MapCameraPosition = .userLocation(fallback: .automatic)

    var body: some View {
        NavigationStack {
            Map(position: $position) {
                UserAnnotation()

                if let route = routeManager.currentRoute {
                    MapPolyline(route.polyline)
                        .stroke(.blue, lineWidth: 4)
                }

                ForEach(placesStore.places.filter { $0.isEnabled }) { place in
                    Annotation(place.name, coordinate: place.coordinate) {
                        PlacePinView(category: place.category)
                    }
                }

                if let dest = routeManager.destination {
                    Marker(routeManager.destinationName, coordinate: dest.placemark.coordinate)
                        .tint(.red)
                }
            }
            .mapControls {
                MapUserLocationButton()
                MapCompass()
                MapScaleView()
            }
            .navigationTitle("Map")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

// MARK: - Place pin

struct PlacePinView: View {
    let category: PlaceCategory

    var body: some View {
        ZStack {
            Circle()
                .fill(pinColor)
                .frame(width: 32, height: 32)
                .shadow(radius: 3)
            Image(systemName: category.icon)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(.white)
        }
    }

    private var pinColor: Color {
        switch category {
        case .gas:   return .orange
        case .food:  return .red
        case .other: return .blue
        }
    }
}
