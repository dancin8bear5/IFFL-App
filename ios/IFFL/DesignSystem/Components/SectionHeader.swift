import SwiftUI

/// Eyebrow + (optional) trailing accessory for grouped sections.
struct SectionHeader: View {
    let title: String
    var accessory: AnyView? = nil

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text.eyebrow(title)
            Spacer()
            if let accessory { accessory }
        }
        .padding(.horizontal, Theme.Spacing.lg)
        .padding(.top, Theme.Spacing.lg)
        .padding(.bottom, Theme.Spacing.sm)
    }
}
