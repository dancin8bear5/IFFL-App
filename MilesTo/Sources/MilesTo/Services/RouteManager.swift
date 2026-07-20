import MapKit

@MainActor
class RouteManager: ObservableObject {
    @Published var currentRoute: MKRoute?
    @Published var destination: MKMapItem?
    @Published var destinationName: String = ""
    @Published var waypoints: [RouteWaypoint] = []
    @Published var isCalculatingRoute: Bool = false
    @Published var routeError: String?

    private let onRouteRadiusMeters: Double = 1609.34  // 1 mile

    func setDestination(_ item: MKMapItem) async {
        destination = item
        destinationName = item.name ?? "Destination"
        isCalculatingRoute = true
        routeError = nil

        let request = MKDirections.Request()
        request.source = MKMapItem.forCurrentLocation()
        request.destination = item
        request.transportType = .automobile

        do {
            let directions = MKDirections(request: request)
            let response = try await directions.calculate()
            currentRoute = response.routes.first
        } catch {
            routeError = "Could not calculate route: \(error.localizedDescription)"
        }
        isCalculatingRoute = false
    }

    func clearRoute() {
        currentRoute = nil
        destination = nil
        destinationName = ""
        waypoints = []
    }

    func refreshWaypoints(from location: CLLocation, places: [SavedPlace]) {
        guard let route = currentRoute else {
            waypoints = []
            return
        }

        let coords = route.polyline.coordinates
        guard !coords.isEmpty else { return }

        let totalDistance = route.distance
        let totalTime = route.expectedTravelTime
        guard totalDistance > 0 else { return }
        let timePerMeter = totalTime / totalDistance

        let startIdx = closestPolylineIndex(to: location, in: coords)
        let enabledPlaces = places.filter { $0.isEnabled }

        var newWaypoints: [RouteWaypoint] = []
        for place in enabledPlaces {
            if let wp = calculateWaypoint(
                for: place,
                coords: coords,
                startIdx: startIdx,
                currentLocation: location,
                timePerMeter: timePerMeter
            ) {
                newWaypoints.append(wp)
            }
        }

        waypoints = newWaypoints.sorted { $0.milesAlongRoute < $1.milesAlongRoute }
    }

    private func closestPolylineIndex(to location: CLLocation, in coords: [CLLocationCoordinate2D]) -> Int {
        var minDist = Double.greatestFiniteMagnitude
        var idx = 0
        for (i, coord) in coords.enumerated() {
            let d = location.distance(from: CLLocation(latitude: coord.latitude, longitude: coord.longitude))
            if d < minDist { minDist = d; idx = i }
        }
        return idx
    }

    private func calculateWaypoint(
        for place: SavedPlace,
        coords: [CLLocationCoordinate2D],
        startIdx: Int,
        currentLocation: CLLocation,
        timePerMeter: Double
    ) -> RouteWaypoint? {
        let placeLocation = place.clLocation
        var closestDistToPolyline = Double.greatestFiniteMagnitude
        var closestPolylineIdx = startIdx
        var distAlongRouteAtClosest = 0.0
        var accumulated = 0.0

        for i in startIdx..<(coords.count - 1) {
            let a = CLLocation(latitude: coords[i].latitude, longitude: coords[i].longitude)
            let distToPlace = placeLocation.distance(from: a)
            if distToPlace < closestDistToPolyline {
                closestDistToPolyline = distToPlace
                closestPolylineIdx = i
                distAlongRouteAtClosest = accumulated
            }
            let b = CLLocation(latitude: coords[i + 1].latitude, longitude: coords[i + 1].longitude)
            accumulated += a.distance(from: b)
        }

        guard closestDistToPolyline <= onRouteRadiusMeters else { return nil }

        let milesAlong = distAlongRouteAtClosest / 1609.34
        let minutesFromNow = (distAlongRouteAtClosest * timePerMeter) / 60.0

        let closestRoutePoint = CLLocation(
            latitude: coords[closestPolylineIdx].latitude,
            longitude: coords[closestPolylineIdx].longitude
        )
        // Detour = drive to place + rejoin route, scaled by a 1.3x off-route penalty
        let detourMeters = currentLocation.distance(from: placeLocation) +
                           placeLocation.distance(from: closestRoutePoint)
        let detourMinutes = (detourMeters * timePerMeter * 1.3) / 60.0

        return RouteWaypoint(
            place: place,
            milesAlongRoute: milesAlong,
            minutesFromNow: minutesFromNow,
            detourMinutes: detourMinutes,
            isAhead: true
        )
    }
}
