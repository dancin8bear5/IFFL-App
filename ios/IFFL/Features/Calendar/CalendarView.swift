import SwiftUI

struct CalendarView: View {
    @State private var milestones: [CalendarMilestone] = []
    @State private var isLoading = true
    @State private var error: String?
    @State private var notif = NotificationService.shared

    var body: some View {
        ZStack {
            Color.bgPrimary.ignoresSafeArea()
            content
        }
        .navigationTitle("Calendar")
        .navigationBarTitleDisplayMode(.large)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .task { await load() }
        .refreshable { await load() }
    }

    @ViewBuilder
    private var content: some View {
        if isLoading && milestones.isEmpty {
            ProgressView().controlSize(.large).tint(.textSecondary)
        } else if let error {
            Text(error).foregroundStyle(Theme.Status.over).padding()
        } else {
            ScrollView {
                LazyVStack(spacing: Theme.Spacing.sm) {
                    if notif.authorizationStatus == .denied {
                        deniedBanner
                    }
                    if let next = upcoming.first {
                        SectionHeader(title: "Next up")
                        MilestoneRow(
                            milestone: next,
                            isPrimary: true,
                            isReminderOn: notif.isReminderEnabled(for: next),
                            toggleReminder: { await toggle(next) }
                        )
                    }
                    if upcoming.count > 1 {
                        SectionHeader(title: "Upcoming")
                        VStack(spacing: 0) {
                            ForEach(upcoming.dropFirst()) { m in
                                MilestoneRow(
                                    milestone: m,
                                    isPrimary: false,
                                    isReminderOn: notif.isReminderEnabled(for: m),
                                    toggleReminder: { await toggle(m) }
                                )
                                if m.id != upcoming.last?.id {
                                    Divider().background(Theme.BG.divider)
                                        .padding(.leading, Theme.Spacing.lg)
                                }
                            }
                        }
                        .background(
                            Theme.BG.card,
                            in: RoundedRectangle(cornerRadius: Theme.Radius.large, style: .continuous)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: Theme.Radius.large, style: .continuous)
                                .strokeBorder(.white.opacity(0.04), lineWidth: 0.5)
                        )
                        .padding(.horizontal, Theme.Spacing.lg)
                    }
                    if !past.isEmpty {
                        SectionHeader(title: "Past")
                        VStack(spacing: 0) {
                            ForEach(past) { m in
                                MilestoneRow(
                                    milestone: m,
                                    isPrimary: false,
                                    isReminderOn: false,
                                    toggleReminder: nil
                                )
                                .opacity(0.55)
                                if m.id != past.last?.id {
                                    Divider().background(Theme.BG.divider)
                                        .padding(.leading, Theme.Spacing.lg)
                                }
                            }
                        }
                        .background(
                            Theme.BG.card,
                            in: RoundedRectangle(cornerRadius: Theme.Radius.large, style: .continuous)
                        )
                        .padding(.horizontal, Theme.Spacing.lg)
                    }
                    Spacer().frame(height: 96)
                }
                .padding(.top, Theme.Spacing.sm)
            }
        }
    }

    private var upcoming: [CalendarMilestone] {
        milestones.filter(\.isUpcoming)
    }

    private var past: [CalendarMilestone] {
        milestones.filter { !$0.isUpcoming }.reversed()
    }

    private var deniedBanner: some View {
        Button {
            if let url = URL(string: UIApplication.openSettingsURLString) {
                UIApplication.shared.open(url)
            }
        } label: {
            HStack(spacing: 10) {
                Image(systemName: "bell.slash.fill")
                    .foregroundStyle(Theme.Status.warn)
                VStack(alignment: .leading) {
                    Text("Notifications disabled")
                        .font(AppFont.rowStrong)
                        .foregroundStyle(Theme.Text.primary)
                    Text("Enable in Settings to get league reminders")
                        .font(AppFont.caption)
                        .foregroundStyle(Theme.Text.secondary)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .foregroundStyle(Theme.Text.tertiary)
            }
            .padding()
            .background(
                Theme.BG.card,
                in: RoundedRectangle(cornerRadius: Theme.Radius.medium, style: .continuous)
            )
            .padding(.horizontal, Theme.Spacing.lg)
        }
        .buttonStyle(.plain)
    }

    private func load() async {
        error = nil
        do {
            milestones = try await LeagueRepository.shared.fetchCalendar()
            await notif.refreshAuthorizationStatus()
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }

    private func toggle(_ milestone: CalendarMilestone) async {
        let isOn = notif.isReminderEnabled(for: milestone)
        _ = await notif.setReminder(!isOn, for: milestone)
    }
}

private struct MilestoneRow: View {
    let milestone: CalendarMilestone
    let isPrimary: Bool
    let isReminderOn: Bool
    let toggleReminder: (() async -> Void)?

    @State private var localOn: Bool = false

    private var urgencyColor: Color {
        let days = milestone.daysUntil
        if !milestone.isUpcoming { return Theme.Text.tertiary }
        if days <= 7 { return Theme.Status.over }
        if days <= 30 { return Theme.Status.warn }
        return Theme.Accent.cool
    }

    var body: some View {
        HStack(alignment: .center, spacing: Theme.Spacing.md) {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(milestone.dueAt, format: .dateTime.month(.abbreviated).day())
                        .font(AppFont.captionStrong)
                        .tabularNumerals()
                        .foregroundStyle(urgencyColor)
                    if isPrimary || milestone.daysUntil <= 7 {
                        Text(milestone.countdownLabel)
                            .font(AppFont.caption)
                            .foregroundStyle(Theme.Text.tertiary)
                    }
                }
                Text(milestone.milestone)
                    .font(isPrimary ? AppFont.titleM : AppFont.row)
                    .foregroundStyle(Theme.Text.primary)
                    .lineLimit(2)
                if let desc = milestone.description, !desc.isEmpty {
                    Text(desc)
                        .font(AppFont.caption)
                        .foregroundStyle(Theme.Text.secondary)
                        .lineLimit(2)
                }
            }
            Spacer()
            if let toggle = toggleReminder {
                Button {
                    Task {
                        localOn.toggle()
                        await toggle()
                    }
                } label: {
                    Image(systemName: localOn ? "bell.fill" : "bell")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(localOn ? Theme.Accent.primary : Theme.Text.tertiary)
                        .frame(width: 32, height: 32)
                        .background(
                            Circle().fill(localOn ? Theme.Accent.primary.opacity(0.15) : Theme.BG.elevated)
                        )
                        .symbolEffect(.bounce, value: localOn)
                }
                .buttonStyle(.plain)
                .sensoryFeedback(.selection, trigger: localOn)
            }
        }
        .padding(.horizontal, isPrimary ? Theme.Spacing.lg : Theme.Spacing.md)
        .padding(.vertical, Theme.Spacing.md)
        .background(isPrimary ? Theme.BG.card : Color.clear)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.large, style: .continuous))
        .overlay(
            isPrimary
                ? AnyView(
                    RoundedRectangle(cornerRadius: Theme.Radius.large, style: .continuous)
                        .strokeBorder(.white.opacity(0.04), lineWidth: 0.5)
                )
                : AnyView(EmptyView())
        )
        .padding(.horizontal, isPrimary ? Theme.Spacing.lg : 0)
        .onAppear { localOn = isReminderOn }
    }
}

/// Wrapper for the Calendar tab so the view becomes the tab root with its own NavigationStack.
struct CalendarTabRoot: View {
    var body: some View {
        NavigationStack { CalendarView() }
    }
}
