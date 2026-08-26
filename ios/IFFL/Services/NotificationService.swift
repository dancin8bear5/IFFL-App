import Foundation
import UserNotifications

/// Local notifications for league calendar milestones. We schedule one
/// notification per (milestone, lead time). User toggles are persisted to
/// UserDefaults under a stable identifier derived from the milestone id.
@MainActor
@Observable
public final class NotificationService {
    public static let shared = NotificationService()

    public enum AuthorizationStatus: Sendable {
        case unknown, denied, granted, provisional
    }

    public private(set) var authorizationStatus: AuthorizationStatus = .unknown

    private let center = UNUserNotificationCenter.current()
    private let defaults = UserDefaults.standard

    private init() {
        Task { await refreshAuthorizationStatus() }
    }

    // MARK: authorization

    public func refreshAuthorizationStatus() async {
        let settings = await center.notificationSettings()
        switch settings.authorizationStatus {
        case .authorized:    authorizationStatus = .granted
        case .provisional:   authorizationStatus = .provisional
        case .denied:        authorizationStatus = .denied
        default:             authorizationStatus = .unknown
        }
    }

    @discardableResult
    public func requestAuthorization() async -> Bool {
        do {
            let granted = try await center.requestAuthorization(
                options: [.alert, .badge, .sound]
            )
            await refreshAuthorizationStatus()
            return granted
        } catch {
            return false
        }
    }

    // MARK: per-milestone reminders

    public func isReminderEnabled(for milestone: CalendarMilestone) -> Bool {
        defaults.bool(forKey: defaultsKey(for: milestone))
    }

    /// Toggle a milestone reminder on/off. Lead times: 7d before, 24h before,
    /// at-time. Returns the granted authorization status (so callers can show
    /// settings prompt if denied).
    public func setReminder(_ enabled: Bool,
                              for milestone: CalendarMilestone) async -> AuthorizationStatus {
        if enabled && authorizationStatus == .unknown {
            _ = await requestAuthorization()
        }
        defaults.set(enabled, forKey: defaultsKey(for: milestone))
        if enabled, authorizationStatus == .granted || authorizationStatus == .provisional {
            await schedule(milestone: milestone)
        } else {
            await cancel(milestone: milestone)
        }
        return authorizationStatus
    }

    public func reschedule(_ milestones: [CalendarMilestone]) async {
        guard authorizationStatus == .granted || authorizationStatus == .provisional else { return }
        for m in milestones where isReminderEnabled(for: m) {
            await schedule(milestone: m)
        }
    }

    private func schedule(milestone: CalendarMilestone) async {
        await cancel(milestone: milestone)
        let leads: [(String, TimeInterval)] = [
            ("7d", -7 * 24 * 3600),
            ("1d", -24 * 3600),
            ("at", 0),
        ]
        for (suffix, offset) in leads {
            let fire = milestone.dueAt.addingTimeInterval(offset)
            guard fire > Date() else { continue }
            let content = UNMutableNotificationContent()
            content.title = milestone.milestone
            content.body  = body(for: milestone, leadSuffix: suffix)
            content.sound = .default
            let comps = Calendar.current.dateComponents(
                [.year, .month, .day, .hour, .minute], from: fire
            )
            let trigger = UNCalendarNotificationTrigger(dateMatching: comps, repeats: false)
            let request = UNNotificationRequest(
                identifier: identifier(for: milestone, suffix: suffix),
                content: content,
                trigger: trigger
            )
            try? await center.add(request)
        }
    }

    private func cancel(milestone: CalendarMilestone) async {
        let suffixes = ["7d", "1d", "at"]
        let ids = suffixes.map { identifier(for: milestone, suffix: $0) }
        center.removePendingNotificationRequests(withIdentifiers: ids)
    }

    private func body(for milestone: CalendarMilestone, leadSuffix: String) -> String {
        switch leadSuffix {
        case "7d": return "1 week to go. \(milestone.description ?? "")"
        case "1d": return "Tomorrow. \(milestone.description ?? "")"
        case "at": return milestone.description ?? "Happening now."
        default:   return milestone.description ?? ""
        }
    }

    private func identifier(for milestone: CalendarMilestone, suffix: String) -> String {
        "iffl.milestone.\(milestone.id.uuidString).\(suffix)"
    }

    private func defaultsKey(for milestone: CalendarMilestone) -> String {
        "iffl.milestone.enabled.\(milestone.id.uuidString)"
    }
}
