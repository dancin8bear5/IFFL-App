import SwiftUI
import FirebaseAuth

// MARK: - App Entry Point

@main
struct IFFLApp: App {
    @StateObject private var authService = AuthenticationService()
    @StateObject private var appState   = AppState()
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    init() {
        configureAppearance()
    }

    var body: some Scene {
        WindowGroup {
            if authService.isLoggedIn {
                IFFLContentView()
                    .environmentObject(appState)
                    .onAppear {
                        if let user = Auth.auth().currentUser {
                            appState.setup(for: user)
                        }
                    }
            } else {
                LoginView(authService: authService)
            }
        }
    }

    private func configureAppearance() {
        // Tab bar
        let tabBar = UITabBarAppearance()
        tabBar.configureWithOpaqueBackground()
        tabBar.backgroundColor = UIColor(red: 0.078, green: 0.094, blue: 0.153, alpha: 1)
        let unselected = UIColor.white.withAlphaComponent(0.6)
        tabBar.stackedLayoutAppearance.normal.iconColor = unselected
        tabBar.stackedLayoutAppearance.normal.titleTextAttributes = [.foregroundColor: unselected]
        tabBar.inlineLayoutAppearance.normal.iconColor = unselected
        tabBar.inlineLayoutAppearance.normal.titleTextAttributes = [.foregroundColor: unselected]
        tabBar.compactInlineLayoutAppearance.normal.iconColor = unselected
        tabBar.compactInlineLayoutAppearance.normal.titleTextAttributes = [.foregroundColor: unselected]
        UITabBar.appearance().standardAppearance  = tabBar
        UITabBar.appearance().scrollEdgeAppearance = tabBar
        UITabBar.appearance().tintColor            = UIColor(red: 0.902, green: 0.224, blue: 0.275, alpha: 1)

        // Segmented controls (Market/League/Rosters tab pickers)
        UISegmentedControl.appearance().setTitleTextAttributes(
            [.foregroundColor: UIColor.white], for: .normal)
        UISegmentedControl.appearance().setTitleTextAttributes(
            [.foregroundColor: UIColor.black], for: .selected)

        // Navigation bar
        let navBar = UINavigationBarAppearance()
        navBar.configureWithOpaqueBackground()
        navBar.backgroundColor = UIColor(red: 0.039, green: 0.051, blue: 0.102, alpha: 1)
        navBar.titleTextAttributes      = [.foregroundColor: UIColor.white]
        navBar.largeTitleTextAttributes = [.foregroundColor: UIColor.white]
        UINavigationBar.appearance().standardAppearance   = navBar
        UINavigationBar.appearance().scrollEdgeAppearance = navBar
        UINavigationBar.appearance().tintColor            = UIColor(red: 0.902, green: 0.224, blue: 0.275, alpha: 1)
    }
}

// MARK: - Root Tab Container

struct IFFLContentView: View {
    @EnvironmentObject var appState: AppState
    @State private var selectedTab: Int = 0

    private var myMatchCount: Int { appState.myMatchCount }

    var body: some View {
        TabView(selection: $selectedTab) {
            DashboardView(selectedTab: $selectedTab)
                .tabItem { Label("Dashboard", systemImage: "house.fill") }
                .tag(0)

            RostersView()
                .tabItem { Label("Rosters", systemImage: "person.3.fill") }
                .tag(1)

            MarketView()
                .tabItem { Label("Market", systemImage: "arrow.2.squarepath") }
                .badge(myMatchCount)
                .tag(2)

            LeagueView()
                .tabItem { Label("League", systemImage: "trophy.fill") }
                .tag(3)

            if appState.isAdmin {
                AdminView()
                    .tabItem { Label("Admin", systemImage: "shield.checkered") }
                    .tag(4)
            }
        }
        .onChange(of: appState.triggerTradeProposal) { triggered in
            if triggered {
                selectedTab = 2
                // MarketView resets triggerTradeProposal after it fires its own push
            }
        }
        .onChange(of: appState.didLoadSettings) { loaded in
            // Apply the user's saved default launch tab once, on initial settings load.
            if loaded {
                let tab = appState.userSettings.defaultTab
                if (0...3).contains(tab) { selectedTab = tab }
            }
        }
    }
}
