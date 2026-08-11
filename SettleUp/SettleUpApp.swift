import SwiftUI
import SwiftData

@main
struct SettleUpApp: App {
    var body: some Scene {
        WindowGroup {
            TripListView()
                .preferredColorScheme(.dark)
        }
        .modelContainer(for: [Trip.self, Player.self, Game.self, GameLine.self])
    }
}
