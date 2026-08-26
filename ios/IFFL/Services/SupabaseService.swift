import Foundation
import Supabase

/// Wraps the Supabase client. Single instance, shared across the app.
/// Auth state is observable so views can react to sign-in/sign-out.
@MainActor
@Observable
public final class SupabaseService {
    public static let shared = SupabaseService()

    public let client: SupabaseClient
    public private(set) var session: Session?

    private init() {
        self.client = SupabaseClient(
            supabaseURL: Configuration.supabaseURL,
            supabaseKey: Configuration.supabaseAnonKey
        )
        Task { await self.observeAuthChanges() }
    }

    public var isAuthenticated: Bool { session != nil }

    private func observeAuthChanges() async {
        for await (event, session) in client.auth.authStateChanges {
            self.session = session
            switch event {
            case .signedIn, .tokenRefreshed, .userUpdated, .initialSession:
                break
            case .signedOut, .userDeleted:
                self.session = nil
            default:
                break
            }
        }
    }

    public func signOut() async throws {
        try await client.auth.signOut()
    }
}
