import SwiftUI

// MARK: - FMK Swiper (Tinder-style rating deck for trade interest)

struct FMKSwiperView: View {
    @EnvironmentObject var appState: AppState
    @State private var currentIndex: Int = 0
    @State private var dragOffset: CGSize = .zero
    @State private var showSignalOverlay: FMKSignal? = nil

    private var deck: [DisplayAsset] {
        let all = appState.allDisplayAssets
        let unrated = all.filter { appState.currentFMKSignal(for: $0) == nil }
        let rated   = all.filter { appState.currentFMKSignal(for: $0) != nil }
        return unrated + rated
    }

    private var current: DisplayAsset? {
        guard currentIndex < deck.count else { return nil }
        return deck[currentIndex]
    }

    var body: some View {
        ZStack {
            Color.beltBg.ignoresSafeArea()
            VStack(spacing: 16) {
                progressHeader
                if let asset = current {
                    ZStack {
                        if currentIndex + 1 < deck.count {
                            fmkCard(asset: deck[currentIndex + 1])
                                .scaleEffect(0.95)
                                .offset(y: 10)
                                .opacity(0.5)
                                .allowsHitTesting(false)
                        }
                        fmkCard(asset: asset)
                            .offset(dragOffset)
                            .rotationEffect(.degrees(Double(dragOffset.width) / 22))
                            .overlay(signalOverlay)
                            .gesture(swipeGesture)
                    }
                    .padding(.horizontal, 24)
                    .animation(.interactiveSpring(), value: dragOffset)

                    actionButtons(asset: asset)
                } else {
                    completedState
                }
                Spacer()
            }
            .padding(.top, 8)
        }
    }

    // MARK: Progress header

    private var progressHeader: some View {
        let total = deck.count
        let remaining = max(0, total - currentIndex)
        return VStack(spacing: 6) {
            Text("\(remaining) remaining")
                .font(.caption).foregroundColor(Color.beltSubtext)
            ProgressView(value: Double(currentIndex), total: Double(max(1, total)))
                .tint(Color.beltAccent)
                .padding(.horizontal, 40)
        }
    }

    // MARK: Card

    private func fmkCard(asset: DisplayAsset) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                Image(asset.teamName)
                    .resizable().scaledToFill()
                    .frame(width: 40, height: 40)
                    .clipShape(Circle())
                VStack(alignment: .leading, spacing: 2) {
                    Text(asset.teamName)
                        .font(.caption.bold()).foregroundColor(Color.beltSubtext)
                    if let nfl = asset.nflTeam {
                        Text(nfl)
                            .font(.caption2).foregroundColor(Color.beltSubtext.opacity(0.7))
                    }
                }
                Spacer()
                Text(asset.isPick ? "Pick" : asset.position)
                    .font(.caption.bold()).foregroundColor(Color.beltAccent)
                    .padding(.horizontal, 8).padding(.vertical, 3)
                    .background(Color.beltAccent.opacity(0.15))
                    .clipShape(Capsule())
            }

            Text(asset.name)
                .font(.system(size: 26, weight: .bold)).foregroundColor(.white)

            Divider().background(Color.beltElevated)

            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(String(appState.activeSeason) + " Value")
                        .font(.caption).foregroundColor(Color.beltSubtext)
                    Text(asset.formattedCurrentPrice)
                        .font(.title3.bold()).foregroundColor(Color.beltGold)
                }
                Spacer()
                if let existing = appState.currentFMKSignal(for: asset) {
                    Text("\(existing.emoji) \(existing.label)")
                        .font(.caption).foregroundColor(Color.beltSubtext)
                }
            }
        }
        .padding(20)
        .background(Color.beltSurface)
        .cornerRadius(20)
        .shadow(color: .black.opacity(0.4), radius: 12, y: 6)
    }

    // MARK: Signal overlay

    @ViewBuilder
    private var signalOverlay: some View {
        if let sig = showSignalOverlay {
            RoundedRectangle(cornerRadius: 20)
                .stroke(sig.signalColor, lineWidth: 4)
                .overlay(
                    Text(sig.emoji)
                        .font(.system(size: 60))
                        .padding(16)
                    , alignment: sig == .kill ? .topLeading : sig == .marry ? .top : .topTrailing
                )
                .transition(.opacity)
                .animation(.easeIn(duration: 0.1), value: showSignalOverlay)
        }
    }

    // MARK: Action buttons

    private func actionButtons(asset: DisplayAsset) -> some View {
        HStack(spacing: 16) {
            ForEach([FMKSignal.kill, .fuck, .marry], id: \.self) { signal in
                Button { submitSignal(signal, for: asset) } label: {
                    VStack(spacing: 4) {
                        Text(signal.emoji).font(.system(size: 30))
                        Text(signal.label)
                            .font(.caption2.bold()).foregroundColor(Color.beltSubtext)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(Color.beltSurface)
                    .cornerRadius(14)
                }
            }
        }
        .padding(.horizontal, 24)
    }

    // MARK: Completed state

    private var completedState: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 56)).foregroundColor(Color.beltAccent)
            Text("All Rated")
                .font(.title2.bold()).foregroundColor(.white)
            Text("Tap any player to update their signal.")
                .font(.subheadline).foregroundColor(Color.beltSubtext)
                .multilineTextAlignment(.center)
            Spacer()
        }
        .padding()
    }

    // MARK: Swipe gesture

    private var swipeGesture: some Gesture {
        DragGesture()
            .onChanged { value in
                dragOffset = value.translation
                let threshold: CGFloat = 60
                if value.translation.height < -threshold {
                    showSignalOverlay = .marry
                } else if value.translation.width > threshold {
                    showSignalOverlay = .fuck
                } else if value.translation.width < -threshold {
                    showSignalOverlay = .kill
                } else {
                    showSignalOverlay = nil
                }
            }
            .onEnded { value in
                let h = value.translation.width
                let v = value.translation.height
                let threshold: CGFloat = 80
                if v < -threshold {
                    commitSwipe(.marry)
                } else if h > threshold {
                    commitSwipe(.fuck)
                } else if h < -threshold {
                    commitSwipe(.kill)
                } else {
                    withAnimation(.spring()) { dragOffset = .zero }
                    showSignalOverlay = nil
                }
            }
    }

    private func commitSwipe(_ signal: FMKSignal) {
        guard let asset = current else { return }
        let targetX: CGFloat = signal == .kill ? -600 : signal == .marry ? 0 : 600
        let targetY: CGFloat = signal == .marry ? -600 : 0
        withAnimation(.easeOut(duration: 0.25)) {
            dragOffset = CGSize(width: targetX, height: targetY)
        }
        submitSignal(signal, for: asset)
    }

    private func submitSignal(_ signal: FMKSignal, for asset: DisplayAsset) {
        appState.setFMKSignal(for: asset, signal: signal) { _ in }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
            currentIndex += 1
            dragOffset = .zero
            showSignalOverlay = nil
        }
    }
}

// MARK: - FMKSignal UI Extensions

extension FMKSignal {
    var emoji: String {
        switch self {
        case .fuck:  return "🔥"
        case .marry: return "💍"
        case .kill:  return "💀"
        }
    }

    var label: String {
        switch self {
        case .fuck:  return "Fuck"
        case .marry: return "Marry"
        case .kill:  return "Kill"
        }
    }

    var signalColor: Color {
        switch self {
        case .fuck:  return .green
        case .marry: return Color.beltGold
        case .kill:  return .red
        }
    }
}
