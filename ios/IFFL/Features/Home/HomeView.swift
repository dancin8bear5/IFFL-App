import SwiftUI

struct HomeView: View {
    @State private var supabase = SupabaseService.shared

    var body: some View {
        TabView {
            HomeDashboardView()
                .tabItem { Label("Home", systemImage: "house.fill") }

            RosterListView()
                .tabItem { Label("Rosters", systemImage: "person.crop.rectangle.stack") }

            TradesTabRoot()
                .tabItem { Label("Trades", systemImage: "arrow.left.arrow.right") }

            CalendarTabRoot()
                .tabItem { Label("Calendar", systemImage: "calendar") }

            MeTabRoot()
                .tabItem { Label("Me", systemImage: "person.crop.circle") }
        }
        .tint(Theme.Accent.primary)
    }
}

struct MeTabRoot: View {
    @State private var supabase = SupabaseService.shared

    var body: some View {
        NavigationStack {
            ZStack {
                Color.bgPrimary.ignoresSafeArea()
                List {
                    Section("Signed in as") {
                        if let email = supabase.session?.user.email {
                            Text(email)
                                .font(AppFont.body)
                        } else {
                            Text("(unknown)")
                                .foregroundStyle(Theme.Text.secondary)
                        }
                    }
                    .listRowBackground(Theme.BG.card)

                    Section {
                        Button(role: .destructive) {
                            Task { try? await supabase.signOut() }
                        } label: {
                            Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right")
                        }
                    }
                    .listRowBackground(Theme.BG.card)
                }
                .scrollContentBackground(.hidden)
            }
            .navigationTitle("Me")
            .navigationBarTitleDisplayMode(.large)
            .toolbarColorScheme(.dark, for: .navigationBar)
        }
    }
}
