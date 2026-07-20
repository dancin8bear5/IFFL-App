import Foundation
import CoreLocation

enum PlaceCategory: String, Codable, CaseIterable, Identifiable {
    case gas = "Gas"
    case food = "Food"
    case other = "Other"

    var id: String { rawValue }

    var icon: String {
        switch self {
        case .gas:   return "fuelpump.fill"
        case .food:  return "fork.knife"
        case .other: return "mappin.fill"
        }
    }
}

struct SavedPlace: Codable, Identifiable, Hashable {
    var id: UUID = UUID()
    var name: String
    var subtitle: String
    var latitude: Double
    var longitude: Double
    var category: PlaceCategory
    var isEnabled: Bool = true
    var notes: String = ""

    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }

    var clLocation: CLLocation {
        CLLocation(latitude: latitude, longitude: longitude)
    }
}
