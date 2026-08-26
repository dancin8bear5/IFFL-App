import GoogleSignIn
import SwiftUI

@main
struct IFFLApp: App {
    init() {
        AuthService.configureGoogleSignIn()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .preferredColorScheme(.dark)
                .onOpenURL { url in
                    GIDSignIn.sharedInstance.handle(url)
                }
        }
    }
}

private struct RootView: View {
    @State private var supabase = SupabaseService.shared

    var body: some View {
        Group {
            if supabase.isAuthenticated {
                HomeView()
            } else {
                AuthView()
            }
        }
        .animation(.easeInOut(duration: 0.25), value: supabase.isAuthenticated)
    }
}
