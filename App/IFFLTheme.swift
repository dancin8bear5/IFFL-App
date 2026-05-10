import SwiftUI

// MARK: - Color Tokens

extension Color {
    static let iffBg       = Color(hex: "0A0D1A")
    static let iffSurface  = Color(hex: "141827")
    static let iffElevated = Color(hex: "1E2235")
    static let iffAccent   = Color(hex: "E63946")
    static let iffGold     = Color(hex: "F4A261")
    static let iffSubtext  = Color(hex: "9EA8B8")

    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3:  (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6:  (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8:  (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default: (a, r, g, b) = (255, 0, 0, 0)
        }
        self.init(.sRGB,
                  red:     Double(r) / 255,
                  green:   Double(g) / 255,
                  blue:    Double(b) / 255,
                  opacity: Double(a) / 255)
    }
}

// MARK: - Card Modifier

struct IFFLCardModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background(Color.iffSurface)
            .cornerRadius(14)
            .shadow(color: .black.opacity(0.35), radius: 8, y: 4)
    }
}

extension View {
    func iffCard() -> some View { modifier(IFFLCardModifier()) }
}

// MARK: - Button Styles

struct IFFLPrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 16, weight: .semibold))
            .foregroundColor(.white)
            .padding(.horizontal, 24)
            .padding(.vertical, 14)
            .background(Color.iffAccent)
            .clipShape(Capsule())
            .scaleEffect(configuration.isPressed ? 0.96 : 1.0)
            .animation(.easeOut(duration: 0.1), value: configuration.isPressed)
    }
}

struct IFFLOutlineButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 14, weight: .semibold))
            .foregroundColor(Color.iffAccent)
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .overlay(Capsule().stroke(Color.iffAccent, lineWidth: 1.5))
            .scaleEffect(configuration.isPressed ? 0.96 : 1.0)
    }
}
