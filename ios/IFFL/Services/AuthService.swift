import AuthenticationServices
import CryptoKit
import Foundation
import GoogleSignIn
import Supabase
import UIKit

/// Handles Sign in with Apple + Google Sign-In flows, exchanging the resulting
/// identity tokens for a Supabase session.
@MainActor
public enum AuthService {
    public enum Error: Swift.Error, LocalizedError {
        case missingIdentityToken
        case userCancelled
        case unknown(Swift.Error)

        public var errorDescription: String? {
            switch self {
            case .missingIdentityToken: "The provider didn't return an identity token."
            case .userCancelled: "Sign in was cancelled."
            case .unknown(let e): e.localizedDescription
            }
        }
    }

    // MARK: Sign in with Apple

    /// Generates a fresh raw nonce + its SHA256 hash. The hash is sent to Apple
    /// in the request; the raw value is forwarded to Supabase to verify.
    public static func makeNonce() -> (raw: String, sha256: String) {
        let raw = randomNonceString()
        let hashed = SHA256.hash(data: Data(raw.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
        return (raw, hashed)
    }

    private static func randomNonceString(length: Int = 32) -> String {
        let charset: [Character] =
            Array("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._")
        var result = ""
        var remaining = length
        while remaining > 0 {
            var randoms = [UInt8](repeating: 0, count: 16)
            let status = SecRandomCopyBytes(kSecRandomDefault, randoms.count, &randoms)
            precondition(status == errSecSuccess, "SecRandomCopyBytes failed")
            for r in randoms where remaining > 0 {
                if r < charset.count {
                    result.append(charset[Int(r)])
                    remaining -= 1
                }
            }
        }
        return result
    }

    public static func signInWithApple(
        credential: ASAuthorizationAppleIDCredential,
        rawNonce: String
    ) async throws {
        guard let tokenData = credential.identityToken,
              let idToken = String(data: tokenData, encoding: .utf8)
        else {
            throw Error.missingIdentityToken
        }
        do {
            try await SupabaseService.shared.client.auth.signInWithIdToken(
                credentials: .init(provider: .apple, idToken: idToken, nonce: rawNonce)
            )
        } catch {
            throw Error.unknown(error)
        }
    }

    // MARK: Google Sign-In

    public static func configureGoogleSignIn() {
        GIDSignIn.sharedInstance.configuration = GIDConfiguration(
            clientID: Configuration.googleClientId
        )
    }

    public static func signInWithGoogle(presenting: UIViewController) async throws {
        do {
            let result = try await GIDSignIn.sharedInstance.signIn(
                withPresenting: presenting
            )
            guard let idToken = result.user.idToken?.tokenString else {
                throw Error.missingIdentityToken
            }
            try await SupabaseService.shared.client.auth.signInWithIdToken(
                credentials: .init(provider: .google, idToken: idToken)
            )
        } catch let error as NSError where error.code == GIDSignInError.canceled.rawValue {
            throw Error.userCancelled
        } catch {
            throw Error.unknown(error)
        }
    }
}
