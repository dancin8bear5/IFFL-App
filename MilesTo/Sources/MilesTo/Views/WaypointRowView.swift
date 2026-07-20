import SwiftUI

struct WaypointRowView: View {
    let waypoint: RouteWaypoint

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(categoryColor.opacity(0.15))
                    .frame(width: 40, height: 40)
                Image(systemName: waypoint.place.category.icon)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(categoryColor)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(waypoint.place.name)
                    .font(.body.weight(.semibold))
                    .lineLimit(1)
                Text(waypoint.place.subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 3) {
                Text(waypoint.milesString)
                    .font(.body.weight(.bold))
                    .monospacedDigit()
                Text(waypoint.etaString)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
                Text(waypoint.detourString)
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Color.orange)
                    .clipShape(Capsule())
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 10)
    }

    private var categoryColor: Color {
        switch waypoint.place.category {
        case .gas:   return .orange
        case .food:  return .red
        case .other: return .blue
        }
    }
}
