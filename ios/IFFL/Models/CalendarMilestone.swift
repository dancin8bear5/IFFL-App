import Foundation

/// One row of league_calendar.
public struct CalendarMilestone: Identifiable, Hashable, Sendable, Codable {
    public let id: UUID
    public let season: Int
    public let milestone: String
    public let dueAt: Date
    public let description: String?

    public var daysUntil: Int {
        let cal = Calendar.current
        let start = cal.startOfDay(for: Date())
        let end   = cal.startOfDay(for: dueAt)
        return cal.dateComponents([.day], from: start, to: end).day ?? 0
    }

    public var isUpcoming: Bool { dueAt >= Date() }

    /// Compact countdown copy ("In 87 days", "Today", "In 3 hours")
    public var countdownLabel: String {
        let interval = dueAt.timeIntervalSinceNow
        if interval < 0 {
            return "Passed"
        }
        let days = daysUntil
        if days >= 1 {
            return days == 1 ? "Tomorrow" : "In \(days) days"
        }
        let hours = Int(interval / 3600)
        if hours >= 1 {
            return "In \(hours) \(hours == 1 ? "hour" : "hours")"
        }
        let minutes = max(1, Int(interval / 60))
        return "In \(minutes) \(minutes == 1 ? "minute" : "minutes")"
    }

    enum CodingKeys: String, CodingKey {
        case id, season, milestone, description
        case dueAt = "due_at"
    }
}
