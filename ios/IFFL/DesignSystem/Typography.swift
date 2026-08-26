import SwiftUI

/// Curated text styles. Marquee headlines use fixed sizes for predictable
/// layout. Body / row / caption styles use SwiftUI text styles so they
/// scale with the user's Dynamic Type preference (Apple HIG).
enum AppFont {
    // ---- Marquee (fixed) ----
    static let displayXL    = Font.system(size: 40, weight: .heavy,    design: .rounded)
    static let displayL     = Font.system(size: 32, weight: .bold,     design: .rounded)
    static let displayM     = Font.system(size: 24, weight: .bold,     design: .rounded)

    // ---- Section / card titles (fixed for layout consistency) ----
    static let titleL       = Font.system(size: 20, weight: .semibold, design: .rounded)
    static let titleM       = Font.system(size: 17, weight: .semibold, design: .rounded)

    // ---- Body / row (Dynamic Type) ----
    static let body         = Font.body
    static let bodyMedium   = Font.body.weight(.medium)
    static let row          = Font.callout.weight(.medium)
    static let rowStrong    = Font.callout.weight(.semibold)

    // ---- Captions + labels (Dynamic Type) ----
    static let caption      = Font.caption.weight(.medium)
    static let captionStrong = Font.caption.weight(.semibold)
    static let eyebrow      = Font.caption2.weight(.heavy).width(.expanded)
}

/// Tabular-figure modifier for any number-bearing text. Stacks $25 under
/// $107 cleanly. Always pair money formatting with this.
extension View {
    func tabularNumerals() -> some View {
        self.monospacedDigit()
    }
}

extension Text {
    /// Eyebrow label: small, all-caps, kerned, secondary-toned.
    static func eyebrow(_ s: String) -> Text {
        Text(s.uppercased())
            .font(AppFont.eyebrow)
            .tracking(1.2)
            .foregroundColor(Theme.Text.secondary)
    }
}
