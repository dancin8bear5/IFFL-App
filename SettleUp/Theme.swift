import SwiftUI

// MARK: - Design tokens
//
// Palette mirrors the IFFL app so SettleUp feels like a sibling, but this file
// is fully self-contained — no dependency on the IFFL target.

extension Color {
    /// #0A0D1A — screen background
    static let suBg       = Color(hex: 0x0A0D1A)
    /// #141827 — cards / list rows
    static let suSurface  = Color(hex: 0x141827)
    /// #1E2235 — elevated surfaces / modals / dividers
    static let suElevated = Color(hex: 0x1E2235)
    /// #E63946 — CTAs / active / "owes" (red)
    static let suAccent   = Color(hex: 0xE63946)
    /// #F4A261 — money values / prices
    static let suGold     = Color(hex: 0xF4A261)
    /// #2A9D8F — positive / "is owed" (green)
    static let suPositive = Color(hex: 0x2A9D8F)
    /// #FFFFFF — primary text
    static let suText     = Color.white
    /// #9EA8B8 — secondary text
    static let suSubtext  = Color(hex: 0x9EA8B8)

    init(hex: UInt, alpha: Double = 1.0) {
        self.init(
            .sRGB,
            red:   Double((hex >> 16) & 0xFF) / 255.0,
            green: Double((hex >> 8)  & 0xFF) / 255.0,
            blue:  Double(hex & 0xFF) / 255.0,
            opacity: alpha
        )
    }
}

// MARK: - Card modifier

struct CardModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(16)
            .background(Color.suSurface)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .shadow(color: .black.opacity(0.25), radius: 6, x: 0, y: 3)
    }
}

extension View {
    /// Standard surface card: padded, rounded, subtle shadow.
    func card() -> some View { modifier(CardModifier()) }
}

// MARK: - Money formatting

extension Int {
    /// "$1,250" — whole-dollar display.
    var asDollars: String {
        let sign = self < 0 ? "-" : ""
        let n = abs(self)
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.maximumFractionDigits = 0
        let body = f.string(from: NSNumber(value: n)) ?? "\(n)"
        return "\(sign)$\(body)"
    }

    /// "+$120" / "-$50" — signed display for net balances.
    var asSignedDollars: String {
        (self > 0 ? "+" : "") + asDollars
    }
}
