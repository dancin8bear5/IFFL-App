import SwiftUI

/// Square team mascot avatar. The clipping order is deliberate:
///   1. .frame(width:, height:) — sets the geometry
///   2. .aspectRatio(contentMode: .fill) on the inner image, scoped by .clipped()
///      so .scaledToFill overflow can't bleed past the frame
///   3. .clipShape(RoundedRectangle) to round the corners
///
/// Falls back to a monogram with the owner's initials when the asset is missing.
struct TeamAvatarView: View {
    let masterName: String
    let initials: String
    var size: CGFloat = 56
    var cornerRadius: CGFloat? = nil

    private var radius: CGFloat { cornerRadius ?? size * 0.22 }

    var body: some View {
        Group {
            if let img = UIImage(named: avatarFilename) {
                imageContent(img)
            } else {
                monogram
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: radius, style: .continuous)
                .strokeBorder(.white.opacity(0.06), lineWidth: 0.5)
        )
        .accessibilityElement()
        .accessibilityLabel("\(masterName) team avatar")
    }

    private func imageContent(_ img: UIImage) -> some View {
        Image(uiImage: img)
            .resizable()
            .aspectRatio(contentMode: .fill)
            .frame(width: size, height: size)
            .clipped()
    }

    private var monogram: some View {
        ZStack {
            LinearGradient(
                colors: [Theme.BG.cardHover, Theme.BG.elevated],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
            Text(initials)
                .font(.system(size: size * 0.36, weight: .heavy, design: .rounded))
                .foregroundStyle(Theme.Text.primary)
                .accessibilityHidden(true)
        }
    }

    private var avatarFilename: String {
        masterName.replacingOccurrences(of: " ", with: "")
    }
}
