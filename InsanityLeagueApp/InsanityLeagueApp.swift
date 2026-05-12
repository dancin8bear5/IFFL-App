import SwiftUI

@main
struct InsanityLeagueApp: App {
    init() {
        configureAppearance()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }

    private func configureAppearance() {
        let tabBarAppearance = UITabBarAppearance()
        tabBarAppearance.configureWithOpaqueBackground()
        tabBarAppearance.backgroundColor = UIColor(red: 0.078, green: 0.094, blue: 0.153, alpha: 1)

        UITabBar.appearance().standardAppearance = tabBarAppearance
        UITabBar.appearance().scrollEdgeAppearance = tabBarAppearance
        UITabBar.appearance().tintColor = UIColor(red: 0.902, green: 0.224, blue: 0.275, alpha: 1)
        UITabBar.appearance().unselectedItemTintColor = UIColor(red: 0.620, green: 0.659, blue: 0.722, alpha: 1)

        UINavigationBar.appearance().largeTitleTextAttributes = [
            .foregroundColor: UIColor.white
        ]
        UINavigationBar.appearance().titleTextAttributes = [
            .foregroundColor: UIColor.white
        ]
    }
}
