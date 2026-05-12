import SwiftUI

// MARK: - Shared Web Page Template

struct WebPageView: View {
    let tab: AppTab

    @State private var isLoading = true
    @State private var loadFailed = false

    var body: some View {
        VStack(spacing: 0) {
            pageHeader
            webContent
        }
        .background(Color(hex: "0A0D1A"))
        .ignoresSafeArea(edges: .bottom)
    }

    // MARK: Header

    private var pageHeader: some View {
        ZStack {
            LinearGradient(
                colors: [Color(hex: "1A1D2E"), Color(hex: "0A0D1A")],
                startPoint: .top,
                endPoint: .bottom
            )

            HStack(spacing: 12) {
                Image(systemName: tab.icon)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(Color(hex: "E63946"))

                Text(tab.title)
                    .font(.system(size: 20, weight: .bold))
                    .foregroundColor(.white)

                Spacer()

                Button {
                    loadFailed = false
                    isLoading = true
                } label: {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(Color(hex: "9EA8B8"))
                        .frame(width: 36, height: 36)
                        .background(Color.white.opacity(0.07))
                        .clipShape(Circle())
                }
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 12)
        }
        .frame(height: 72)
    }

    // MARK: Web Content

    private var webContent: some View {
        ZStack {
            if !loadFailed {
                WebViewContainer(
                    url: tab.url,
                    isLoading: $isLoading,
                    loadFailed: $loadFailed
                )
                .transition(.opacity)
            }

            if isLoading && !loadFailed {
                loadingOverlay
            }

            if loadFailed {
                errorView
            }
        }
    }

    // MARK: Loading Overlay

    private var loadingOverlay: some View {
        ZStack {
            Color(hex: "0A0D1A")

            VStack(spacing: 16) {
                ProgressView()
                    .progressViewStyle(CircularProgressViewStyle(tint: Color(hex: "E63946")))
                    .scaleEffect(1.4)

                Text("Loading \(tab.title)…")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(Color(hex: "9EA8B8"))
            }
            .padding(32)
            .background(
                RoundedRectangle(cornerRadius: 20)
                    .fill(Color(hex: "141827"))
                    .shadow(color: .black.opacity(0.4), radius: 20, y: 8)
            )
        }
        .transition(.opacity)
    }

    // MARK: Error View

    private var errorView: some View {
        ZStack {
            Color(hex: "0A0D1A")

            VStack(spacing: 20) {
                Image(systemName: "wifi.slash")
                    .font(.system(size: 48))
                    .foregroundColor(Color(hex: "9EA8B8"))

                VStack(spacing: 8) {
                    Text("Unable to Load")
                        .font(.system(size: 20, weight: .bold))
                        .foregroundColor(.white)

                    Text("Check your connection and try again.")
                        .font(.system(size: 14))
                        .foregroundColor(Color(hex: "9EA8B8"))
                        .multilineTextAlignment(.center)
                }

                Button {
                    loadFailed = false
                    isLoading = true
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "arrow.clockwise")
                        Text("Retry")
                    }
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 28)
                    .padding(.vertical, 14)
                    .background(Color(hex: "E63946"))
                    .clipShape(Capsule())
                }
                .shadow(color: Color(hex: "E63946").opacity(0.4), radius: 12, y: 4)
            }
            .padding(32)
        }
        .transition(.opacity)
    }
}
