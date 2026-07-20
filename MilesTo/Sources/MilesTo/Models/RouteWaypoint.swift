import Foundation

struct RouteWaypoint: Identifiable {
    let id = UUID()
    let place: SavedPlace
    var milesAlongRoute: Double
    var minutesFromNow: Double
    var detourMinutes: Double
    var isAhead: Bool

    var milesString: String {
        String(format: "%.1f mi", milesAlongRoute)
    }

    var etaString: String {
        let hours = Int(minutesFromNow) / 60
        let mins = Int(minutesFromNow) % 60
        if hours > 0 { return "\(hours)h \(mins)m" }
        return "\(mins) min"
    }

    var detourString: String {
        let mins = Int(detourMinutes)
        if mins < 1 { return "<1 min" }
        return "+\(mins) min"
    }

    var arrivalTime: Date {
        Date().addingTimeInterval(minutesFromNow * 60)
    }
}
