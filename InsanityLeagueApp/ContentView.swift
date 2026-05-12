import SwiftUI

// MARK: - Tab

enum AppTab: Int, CaseIterable {
    case home, standings, scores, players

    var title: String {
        switch self {
        case .home:      return "Home"
        case .standings: return "Standings"
        case .scores:    return "Scores"
        case .players:   return "Players"
        }
    }

    var icon: String {
        switch self {
        case .home:      return "house.fill"
        case .standings: return "list.number"
        case .scores:    return "sportscourt.fill"
        case .players:   return "person.3.fill"
        }
    }

    var url: URL {
        switch self {
        case .home:      return URL(string: "https://www.insanityleague.com/")!
        case .standings: return URL(string: "https://www.insanityleague.com/standings")!
        case .scores:    return URL(string: "https://www.insanityleague.com/scores")!
        case .players:   return URL(string: "https://www.insanityleague.com/players")!
        }
    }
}

// MARK: - ContentView

struct ContentView: View {
    @State private var selectedTab: AppTab = .home

    var body: some View {
        ZStack(alignment: .bottom) {
            TabView(selection: $selectedTab) {
                HomeView()
                    .tag(AppTab.home)

                StandingsView()
                    .tag(AppTab.standings)

                ScoresView()
                    .tag(AppTab.scores)

                PlayersView()
                    .tag(AppTab.players)
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .animation(.easeInOut(duration: 0.2), value: selectedTab)

            CustomTabBar(selectedTab: $selectedTab)
        }
        .ignoresSafeArea(edges: .bottom)
        .background(Color(hex: "0A0D1A"))
    }
}

// MARK: - CustomTabBar

struct CustomTabBar: View {
    @Binding var selectedTab: AppTab

    var body: some View {
        HStack(spacing: 0) {
            ForEach(AppTab.allCases, id: \.rawValue) { tab in
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        selectedTab = tab
                    }
                } label: {
                    TabBarItem(tab: tab, isSelected: selectedTab == tab)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 8)
        .padding(.top, 12)
        .padding(.bottom, 28)
        .background(
            Color(hex: "141827")
                .overlay(
                    Rectangle()
                        .frame(height: 0.5)
                        .foregroundColor(Color.white.opacity(0.08)),
                    alignment: .top
                )
        )
    }
}

// MARK: - TabBarItem

struct TabBarItem: View {
    let tab: AppTab
    let isSelected: Bool

    var body: some View {
        VStack(spacing: 5) {
            ZStack {
                if isSelected {
                    Circle()
                        .fill(Color(hex: "E63946").opacity(0.15))
                        .frame(width: 44, height: 44)
                        .blur(radius: 6)
                }
                Image(systemName: tab.icon)
                    .font(.system(size: 22, weight: isSelected ? .semibold : .regular))
                    .foregroundColor(isSelected ? Color(hex: "E63946") : Color(hex: "9EA8B8"))
                    .scaleEffect(isSelected ? 1.1 : 1.0)
                    .animation(.spring(response: 0.3, dampingFraction: 0.6), value: isSelected)
            }
            .frame(width: 44, height: 44)

            Text(tab.title)
                .font(.system(size: 10, weight: isSelected ? .semibold : .regular))
                .foregroundColor(isSelected ? Color(hex: "E63946") : Color(hex: "9EA8B8"))
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Color Hex Extension

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3:
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6:
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8:
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (255, 0, 0, 0)
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}
