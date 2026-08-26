import AuthenticationServices
import SwiftUI

struct AuthView: View {
    @State private var rawNonce: String?
    @State private var error: AuthError?
    @State private var isSigningInWithGoogle = false

    var body: some View {
        ZStack {
            backgroundGradient
            VStack(spacing: 32) {
                Spacer()
                logo
                title
                Spacer()
                buttons
                disclaimer
            }
            .padding(.horizontal, 32)
            .padding(.bottom, 48)
        }
        .alert(item: $error) { err in
            Alert(title: Text("Sign In Failed"),
                  message: Text(err.message),
                  dismissButton: .default(Text("OK")))
        }
    }

    private var backgroundGradient: some View {
        LinearGradient(
            colors: [
                Color(red: 0.04, green: 0.04, blue: 0.08),
                Color(red: 0.10, green: 0.05, blue: 0.18),
            ],
            startPoint: .top,
            endPoint: .bottom
        )
        .ignoresSafeArea()
    }

    private var logo: some View {
        Group {
            if let img = UIImage(named: "LeagueLogo") {
                Image(uiImage: img).resizable()
            } else {
                // Fallback: SF Symbol while assets are still being wired up
                Image(systemName: "trophy.fill")
                    .font(.system(size: 96))
                    .foregroundStyle(.tint)
            }
        }
        .scaledToFit()
        .frame(width: 160, height: 160)
        .clipShape(RoundedRectangle(cornerRadius: 32, style: .continuous))
        .shadow(color: .black.opacity(0.4), radius: 24, y: 8)
    }

    private var title: some View {
        VStack(spacing: 8) {
            Text("Insanity Fantasy")
                .font(.system(size: 32, weight: .bold, design: .rounded))
            Text("Football")
                .font(.system(size: 32, weight: .bold, design: .rounded))
            Text("12 owners. One belt.")
                .font(.system(size: 16, weight: .medium, design: .rounded))
                .foregroundStyle(.secondary)
                .padding(.top, 4)
        }
        .multilineTextAlignment(.center)
    }

    private var buttons: some View {
        VStack(spacing: 12) {
            siwaButton
            googleButton
        }
    }

    private var siwaButton: some View {
        SignInWithAppleButton(
            .signIn,
            onRequest: { request in
                let nonce = AuthService.makeNonce()
                rawNonce = nonce.raw
                request.requestedScopes = [.fullName, .email]
                request.nonce = nonce.sha256
            },
            onCompletion: { result in
                Task { await handleAppleResult(result) }
            }
        )
        .signInWithAppleButtonStyle(.white)
        .frame(height: 52)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var googleButton: some View {
        Button {
            Task { await handleGoogleSignIn() }
        } label: {
            HStack(spacing: 10) {
                if isSigningInWithGoogle {
                    ProgressView().tint(.black)
                } else {
                    Image(systemName: "g.circle.fill")
                        .font(.title3)
                }
                Text("Sign in with Google")
                    .font(.system(size: 17, weight: .semibold, design: .rounded))
            }
            .frame(maxWidth: .infinity)
            .frame(height: 52)
            .foregroundStyle(.black)
            .background(.white, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .disabled(isSigningInWithGoogle)
    }

    private var disclaimer: some View {
        Text("Sign-in is restricted to the 12 IFFL owners.")
            .font(.caption)
            .foregroundStyle(.secondary)
    }

    // MARK: actions

    private func handleAppleResult(_ result: Result<ASAuthorization, Swift.Error>) async {
        switch result {
        case .success(let auth):
            guard let credential = auth.credential as? ASAuthorizationAppleIDCredential,
                  let nonce = rawNonce
            else {
                error = AuthError(message: "Apple didn't return a credential.")
                return
            }
            do {
                try await AuthService.signInWithApple(credential: credential, rawNonce: nonce)
            } catch {
                self.error = AuthError(message: error.localizedDescription)
            }
        case .failure(let err):
            // Cancellation is silent
            if (err as? ASAuthorizationError)?.code != .canceled {
                error = AuthError(message: err.localizedDescription)
            }
        }
    }

    private func handleGoogleSignIn() async {
        guard let presenter = topViewController() else {
            error = AuthError(message: "No window available to present Google sign-in.")
            return
        }
        isSigningInWithGoogle = true
        defer { isSigningInWithGoogle = false }
        do {
            try await AuthService.signInWithGoogle(presenting: presenter)
        } catch AuthService.Error.userCancelled {
            // silent
        } catch {
            self.error = AuthError(message: error.localizedDescription)
        }
    }

    private func topViewController() -> UIViewController? {
        let scene = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }
            ?? UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        var top = scene?.keyWindow?.rootViewController
        while let presented = top?.presentedViewController { top = presented }
        return top
    }
}

private struct AuthError: Identifiable {
    let id = UUID()
    let message: String
}
