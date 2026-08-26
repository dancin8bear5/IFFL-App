import SwiftUI

/// Central color palette. Pure black backgrounds, layered cards, semantic
/// status colors. Designed for hard-to-impress sports-app aesthetics
/// (Apple Sports + Robinhood + Linear).
enum Theme {
    enum BG {
        static let primary    = Color.black
        static let elevated   = Color(red: 0.07,  green: 0.07,  blue: 0.10)
        static let card       = Color(red: 0.094, green: 0.094, blue: 0.157)
        static let cardHover  = Color(red: 0.118, green: 0.118, blue: 0.180)
        static let divider    = Color(red: 0.13,  green: 0.13,  blue: 0.18)
    }

    enum Text {
        static let primary    = Color(red: 0.96, green: 0.96, blue: 0.97)
        static let secondary  = Color(red: 0.56, green: 0.56, blue: 0.63)
        static let tertiary   = Color(red: 0.35, green: 0.35, blue: 0.43)
        static let onAccent   = Color.white
    }

    enum Accent {
        /// IFFL primary — deep crimson, fantasy-football energy
        static let primary    = Color(red: 0.84, green: 0.16, blue: 0.16)
        /// Subtle cool counterpoint for non-destructive accents
        static let cool       = Color(red: 0.31, green: 0.50, blue: 0.96)
    }

    /// Semantic status colors. Cap thresholds:
    ///   - safe:  ≤ $260
    ///   - warn:  $261 .. $300
    ///   - over:  > $300
    enum Status {
        static let safe       = Color(red: 0.20, green: 0.83, blue: 0.60)
        static let warn       = Color(red: 0.96, green: 0.62, blue: 0.04)
        static let over       = Color(red: 0.94, green: 0.27, blue: 0.27)
        static let live       = Color(red: 1.00, green: 0.40, blue: 0.27)
        static let win        = Color(red: 0.08, green: 0.72, blue: 0.65)
        static let loss       = Color(red: 0.42, green: 0.45, blue: 0.50)
    }

    enum Position {
        static func color(for position: String) -> Color {
            switch position {
            case "QB":   return Color(red: 0.93, green: 0.41, blue: 0.93)
            case "RB":   return Color(red: 0.10, green: 0.78, blue: 0.66)
            case "WR":   return Color(red: 0.31, green: 0.66, blue: 0.96)
            case "TE":   return Color(red: 0.96, green: 0.62, blue: 0.04)
            case "K":    return Color(red: 0.65, green: 0.65, blue: 0.78)
            case "D/ST": return Color(red: 0.57, green: 0.36, blue: 0.94)
            case "OP":   return Color(red: 0.84, green: 0.30, blue: 0.30)
            default:     return Color(red: 0.50, green: 0.50, blue: 0.55)
            }
        }
    }

    enum Radius {
        static let small: CGFloat   = 8
        static let medium: CGFloat  = 12
        static let large: CGFloat   = 18
        static let xlarge: CGFloat  = 24
    }

    enum Spacing {
        static let xs: CGFloat   = 4
        static let sm: CGFloat   = 8
        static let md: CGFloat   = 12
        static let lg: CGFloat   = 16
        static let xl: CGFloat   = 24
        static let xxl: CGFloat  = 32
    }
}

extension Color {
    /// Lazy SwiftUI shorthand
    static let bgPrimary    = Theme.BG.primary
    static let bgCard       = Theme.BG.card
    static let bgElevated   = Theme.BG.elevated
    static let textPrimary  = Theme.Text.primary
    static let textSecondary = Theme.Text.secondary
    static let textTertiary = Theme.Text.tertiary
    static let divider      = Theme.BG.divider
}
