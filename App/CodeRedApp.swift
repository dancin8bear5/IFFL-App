import SwiftUI
import Firebase
import FirebaseMessaging
import FirebaseAuth
import FirebaseFirestore

// MARK: - AppState

class AppState: ObservableObject {

    // MARK: Published

    @Published var userTeam: String = "Jared"
    @Published var selectedTeam: String = "Jared"
    @Published var isCommissioner: Bool = false
    @Published var activeSeason: Int = 2026 {
        didSet {
            guard oldValue != activeSeason else { return }
            tradeListener?.remove()
            tradeListener = dataService.listenToTrades(season: activeSeason) { [weak self] trades, _ in
                guard let self else { return }
                DispatchQueue.main.async { self.trades = trades }
            }
        }
    }
    @Published var isInitialLoadComplete: Bool = false

    @Published var players: [Player] = []
    @Published var draftPicks: [DraftPickAsset] = []
    @Published var trades: [Trade] = []
    @Published var messages: [Message] = []
    @Published var interestedAssetIds: Set<String> = []

    @Published var selectedAssetForTrade: DisplayAsset? = nil
    @Published var triggerTradeProposal: Bool = false

    // MARK: Internal service (exposed so views/admin can call it directly)

    let dataService = FirestoreDataService()

    // MARK: Private listener handles

    private var playerListener:  ListenerRegistration?
    private var pickListener:    ListenerRegistration?
    private var tradeListener:   ListenerRegistration?
    private var messageListener: ListenerRegistration?

    // MARK: Computed

    var currentUserUID: String? { Auth.auth().currentUser?.uid }

    /// Combined, active roster + available picks as unified view model
    var allDisplayAssets: [DisplayAsset] {
        let playerAssets = players.map { $0.toDisplayAsset(activeSeason: activeSeason) }
        let pickAssets   = draftPicks.map { $0.toDisplayAsset(activeSeason: activeSeason) }
        return playerAssets + pickAssets
    }

    // MARK: Setup / Teardown

    /// Call this once after the user successfully logs in.
    func setup(for user: User) {
        // Determine team from email prefix (fallback; overridden by teamEmailMap below)
        let prefix = user.email?.split(separator: "@").first.map(String.init)?.lowercased() ?? ""
        userTeam     = fantasyTeams.first { $0.name.lowercased().contains(prefix) }?.name ?? "Jared"
        selectedTeam = userTeam

        // Active season + commissioner flag + precise team lookup from config
        dataService.fetchLeagueConfig { [weak self] config in
            guard let self else { return }
            DispatchQueue.main.async {
                self.activeSeason   = config?.activeSeasonYear ?? 2026
                self.isCommissioner = config?.authorizedUIDs.contains(user.uid) ?? false
                if let team = config?.teamEmailMap[prefix] {
                    self.userTeam    = team
                    self.selectedTeam = team
                }
            }
        }

        startListeners()
        loadInterests()
    }

    func teardown() {
        playerListener?.remove();  playerListener  = nil
        pickListener?.remove();    pickListener    = nil
        tradeListener?.remove();   tradeListener   = nil
        messageListener?.remove(); messageListener = nil
    }

    // MARK: Listeners

    private func startListeners() {
        playerListener = dataService.listenToPlayers { [weak self] players, _ in
            guard let self else { return }
            DispatchQueue.main.async {
                self.players = players
                self.isInitialLoadComplete = true
            }
        }

        pickListener = dataService.listenToDraftPicks { [weak self] picks, _ in
            guard let self else { return }
            DispatchQueue.main.async { self.draftPicks = picks }
        }

        tradeListener = dataService.listenToTrades(season: activeSeason) { [weak self] trades, _ in
            guard let self else { return }
            DispatchQueue.main.async { self.trades = trades }
        }

        messageListener = dataService.listenToMessages { [weak self] messages, _ in
            guard let self else { return }
            DispatchQueue.main.async { self.messages = messages ?? [] }
        }
    }

    // MARK: Interests

    private func loadInterests() {
        guard let uid = currentUserUID else { return }
        dataService.getPlayerInterests(for: uid) { [weak self] interests, _ in
            guard let self, let interests else { return }
            DispatchQueue.main.async {
                self.interestedAssetIds = Set(interests.map { $0.assetId })
            }
        }
    }

    func toggleInterest(for asset: DisplayAsset, completion: @escaping (Error?) -> Void) {
        guard let uid = currentUserUID else {
            completion(NSError(domain: "CodeRed", code: -1))
            return
        }
        if interestedAssetIds.contains(asset.assetId) {
            dataService.removePlayerInterest(assetId: asset.assetId, userId: uid) { [weak self] error in
                if error == nil { DispatchQueue.main.async { self?.interestedAssetIds.remove(asset.assetId) } }
                completion(error)
            }
        } else {
            let interest = PlayerInterest(id: nil, userId: uid, assetId: asset.assetId, timestamp: Date())
            dataService.addPlayerInterest(interest) { [weak self] error in
                if error == nil { DispatchQueue.main.async { self?.interestedAssetIds.insert(asset.assetId) } }
                completion(error)
            }
        }
    }
}

// MARK: - AuthenticationService

class AuthenticationService: ObservableObject {
    @Published var isLoggedIn: Bool = false
    private var handle: AuthStateDidChangeListenerHandle?

    init() {
        handle = Auth.auth().addStateDidChangeListener { [weak self] _, user in
            self?.isLoggedIn = user != nil
        }
    }

    deinit {
        if let h = handle { Auth.auth().removeStateDidChangeListener(h) }
    }

    func signIn(email: String, password: String, completion: @escaping (Error?) -> Void) {
        Auth.auth().signIn(withEmail: email, password: password) { _, error in
            completion(error)
        }
    }

    func signOut() {
        try? Auth.auth().signOut()
    }
}

// MARK: - Custom Styles

struct CustomTextFieldStyle: TextFieldStyle {
    func _body(configuration: TextField<Self._Label>) -> some View {
        configuration
            .padding()
            .background(Color("CardBackgroundColor"))
            .cornerRadius(10)
            .foregroundColor(Color("TextColor"))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color("AccentColor"), lineWidth: 1))
    }
}

struct CustomButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .padding()
            .background(Color("AccentColor"))
            .foregroundColor(Color("TextColor"))
            .clipShape(Capsule())
            .scaleEffect(configuration.isPressed ? 0.95 : 1.0)
    }
}

// MARK: - Main App

@main
struct CodeRedApp: App {
    @StateObject private var authService = AuthenticationService()
    @StateObject private var appState   = AppState()
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    init() {
        FirebaseApp.configure()
        UINavigationBar.appearance().barTintColor            = UIColor(named: "BackgroundColor")
        UINavigationBar.appearance().titleTextAttributes     = [.foregroundColor: UIColor(named: "TextColor") ?? .white]
        UITabBar.appearance().barTintColor                   = UIColor(named: "BackgroundColor")
        UITabBar.appearance().unselectedItemTintColor        = UIColor(named: "SecondaryTextColor")
        UITabBar.appearance().tintColor                      = UIColor(named: "AccentColor")
    }

    var body: some Scene {
        WindowGroup {
            if authService.isLoggedIn {
                ContentView()
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
}

// MARK: - AppDelegate (FCM)

class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate, MessagingDelegate {

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        Messaging.messaging().delegate = self
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            if granted { DispatchQueue.main.async { application.registerForRemoteNotifications() } }
        }
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Messaging.messaging().apnsToken = deviceToken
    }

    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let token = fcmToken, let uid = Auth.auth().currentUser?.uid else { return }
        Firestore.firestore().collection("users").document(uid).setData(["fcmToken": token], merge: true)
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound])
    }
}

// MARK: - Login View

struct LoginView: View {
    @ObservedObject var authService: AuthenticationService
    @State private var email: String    = ""
    @State private var password: String = ""
    @State private var errorMessage: String? = nil

    var body: some View {
        ZStack {
            LinearGradient(
                gradient: Gradient(colors: [Color("BackgroundColor"), Color("CardBackgroundColor")]),
                startPoint: .top, endPoint: .bottom
            )
            .edgesIgnoringSafeArea(.all)

            VStack(spacing: 20) {
                Text("Welcome to the IFFL")
                    .font(.largeTitle).fontWeight(.bold)
                    .foregroundColor(Color("TextColor"))

                TextField("Email", text: $email)
                    .textFieldStyle(CustomTextFieldStyle())
                    .keyboardType(.emailAddress)
                    .autocapitalization(.none)

                SecureField("Password", text: $password)
                    .textFieldStyle(CustomTextFieldStyle())

                if let error = errorMessage {
                    Text(error).foregroundColor(.red).font(.body)
                }

                Button("Login") {
                    authService.signIn(email: email, password: password) { error in
                        errorMessage = error?.localizedDescription
                    }
                }
                .buttonStyle(CustomButtonStyle())

                Spacer()
            }
            .padding(.top, 50)
            .padding(.horizontal)
        }
    }
}

// MARK: - Content View

struct ContentView: View {
    @State private var selectedTab: Int = 0
    @EnvironmentObject var appState: AppState

    var body: some View {
        TabView(selection: $selectedTab) {
            HomeView(selectedTab: $selectedTab)
                .tabItem { Label("Home",   systemImage: "house.fill") }
                .tag(0)

            TeamsView()
                .tabItem { Label("Teams",  systemImage: "person.fill") }
                .tag(1)

            PlayersPicksView()
                .tabItem { Label("Players & Picks", systemImage: "person.3") }
                .tag(2)

            TradesView()
                .tabItem { Label("Trades", systemImage: "arrow.triangle.2.circlepath") }
                .tag(3)

            TradeProposalView()
                .tabItem { Label("Propose", systemImage: "person.2.fill") }
                .tag(4)

            if appState.isCommissioner {
                AdminView()
                    .tabItem { Label("Admin", systemImage: "shield.checkered") }
                    .tag(5)
            }
        }
        .accentColor(Color("AccentColor"))
        .onChange(of: appState.triggerTradeProposal) { triggered in
            if triggered {
                selectedTab = 4
                appState.triggerTradeProposal = false
            }
        }
    }
}

// MARK: - Home View

struct HomeView: View {
    @Binding var selectedTab: Int
    @EnvironmentObject var appState: AppState

    var body: some View {
        NavigationStack {
            ZStack {
                LinearGradient(
                    gradient: Gradient(colors: [Color("BackgroundColor"), Color("CardBackgroundColor")]),
                    startPoint: .top, endPoint: .bottom
                )
                .edgesIgnoringSafeArea(.all)

                VStack(spacing: 0) {
                    Text("IFFL")
                        .font(.system(size: 50)).fontWeight(.bold)
                        .foregroundColor(Color("TextColor"))
                        .overlay(
                            Text("IFFL")
                                .font(.system(size: 50)).fontWeight(.bold)
                                .foregroundColor(Color("HomeTitleColor"))
                                .blur(radius: 0.5)
                                .offset(x: 1, y: 1).offset(x: -1, y: -1)
                                .offset(x: 1, y: -1).offset(x: -1, y: 1)
                        )
                        .padding(.top, 5).padding(.bottom, 5)

                    Text("Insanity Fantasy Football League")
                        .font(.system(size: 20)).foregroundColor(Color("TextColor")).padding(.bottom, 2)
                    Text("EST. 2008")
                        .font(.system(size: 10)).foregroundColor(Color("TextColor")).padding(.bottom, 2)

                    ScrollView {
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 100))], spacing: 20) {
                            ForEach(fantasyTeams, id: \.name) { team in
                                NavigationLink(
                                    destination: TeamsView().onAppear { appState.selectedTeam = team.name }
                                ) {
                                    TeamIconView(team: team)
                                }
                            }
                        }
                        .padding()

                        if !appState.messages.isEmpty {
                            Text("League Messages")
                                .font(.headline).foregroundColor(Color("TextColor")).padding(.top, 20)

                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 10) {
                                    ForEach(appState.messages) { message in
                                        CardView {
                                            Text(message.content)
                                                .font(.body).foregroundColor(Color("TextColor")).padding()
                                        }
                                        .frame(width: 300)
                                    }
                                }
                                .padding(.horizontal)
                            }
                        }
                    }

                    Spacer()
                }
            }
            .navigationBarHidden(true)
        }
    }
}

// MARK: - Team Icon View

struct TeamIconView: View {
    let team: FantasyTeam
    var body: some View {
        CardView {
            VStack(spacing: 4) {
                Image(team.name)
                    .resizable().scaledToFit()
                    .frame(width: 70, height: 70)
                Text(team.name)
                    .font(.body).foregroundColor(Color("TextColor"))
            }
        }
    }
}

// MARK: - Card View

struct CardView<Content: View>: View {
    let content: Content
    init(@ViewBuilder content: () -> Content) { self.content = content() }
    var body: some View {
        content
            .padding()
            .background(Color("CardBackgroundColor"))
            .cornerRadius(10)
            .shadow(radius: 5)
    }
}

// MARK: - Teams View

struct TeamsView: View {
    @EnvironmentObject var appState: AppState

    private var teamAssets: [DisplayAsset] {
        appState.allDisplayAssets.filter {
            $0.teamName.lowercased().contains(appState.selectedTeam.lowercased())
        }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                LinearGradient(
                    gradient: Gradient(colors: [Color("BackgroundColor"), Color("CardBackgroundColor")]),
                    startPoint: .top, endPoint: .bottom
                )
                .edgesIgnoringSafeArea(.all)

                VStack(spacing: 0) {
                    Picker("Select Team", selection: $appState.selectedTeam) {
                        ForEach(fantasyTeams.map { $0.name }, id: \.self) { Text($0).tag($0) }
                    }
                    .pickerStyle(MenuPickerStyle())
                    .font(.system(size: 50))
                    .foregroundColor(Color("TextColor"))
                    .padding(.vertical, 10)

                    if !appState.isInitialLoadComplete {
                        Spacer()
                        ProgressView("Loading…").foregroundColor(Color("SecondaryTextColor"))
                        Spacer()
                    } else {
                        List {
                            ForEach(teamAssets) { item in
                                NavigationLink(destination: AssetDetailView(asset: item)) {
                                    AssetRow(item: item, activeSeason: appState.activeSeason)
                                }
                                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                    if item.teamName != appState.userTeam {
                                        Button {
                                            appState.toggleInterest(for: item) { _ in }
                                        } label: {
                                            let isInterested = appState.interestedAssetIds.contains(item.assetId)
                                            Label(isInterested ? "Uninterested" : "Interested",
                                                  systemImage: isInterested ? "star.slash" : "star")
                                        }
                                        .tint(Color("AccentColor"))
                                    }
                                }
                                .listRowBackground(Color("CardBackgroundColor"))
                                .listRowInsets(EdgeInsets())
                                .overlay(rowDivider)
                            }
                        }
                        .listStyle(PlainListStyle())
                        .background(Color("CardBackgroundColor"))
                    }
                    Spacer()
                }
            }
            .toolbar { ToolbarItem(placement: .navigationBarLeading) { EmptyView() } }
        }
    }

    private var rowDivider: some View {
        VStack {
            Spacer()
            Rectangle().frame(height: 1).foregroundColor(Color("TextColor")).padding(.leading, 12)
        }
    }
}

// MARK: - Players & Picks View

struct PlayersPicksView: View {
    @EnvironmentObject var appState: AppState

    @State private var searchPlayer: String = ""
    @State private var selectedTeams: Set<String> = ["All"]
    @State private var selectedPositions: Set<String> = ["All"]
    @State private var sortOption: String = "Highest"

    private let allTeams     = ["All"] + fantasyTeams.map { $0.name }
    private let allPositions = ["All", "QB", "RB", "WR", "TE", "Picks"]
    private let sortOptions  = ["Highest", "Lowest"]

    private var filteredItems: [DisplayAsset] {
        var result = appState.allDisplayAssets

        if !searchPlayer.isEmpty {
            result = result.filter { $0.name.localizedCaseInsensitiveContains(searchPlayer) }
        }
        if !selectedTeams.contains("All") {
            result = result.filter { selectedTeams.contains($0.teamName) }
        }
        if !selectedPositions.contains("All") {
            result = result.filter { item in
                if selectedPositions.contains("Picks") && item.isPick { return true }
                return selectedPositions.contains(item.position)
            }
        }
        return result.sorted {
            sortOption == "Highest"
                ? $0.currentPrice > $1.currentPrice
                : $0.currentPrice < $1.currentPrice
        }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                LinearGradient(
                    gradient: Gradient(colors: [Color("BackgroundColor"), Color("CardBackgroundColor")]),
                    startPoint: .top, endPoint: .bottom
                )
                .edgesIgnoringSafeArea(.all)

                VStack(spacing: 15) {
                    HStack {
                        TextField("Search Player", text: $searchPlayer)
                            .textFieldStyle(CustomTextFieldStyle())
                        if !searchPlayer.isEmpty {
                            Button { searchPlayer = "" } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundColor(Color("SecondaryTextColor"))
                            }
                        }
                    }
                    .padding(.horizontal)

                    FilterSection(
                        selectedTeams: $selectedTeams,
                        selectedPositions: $selectedPositions,
                        sortOption: $sortOption,
                        allTeams: allTeams,
                        allPositions: allPositions,
                        sortOptions: sortOptions
                    )

                    if !appState.isInitialLoadComplete {
                        Spacer()
                        ProgressView("Loading…").foregroundColor(Color("SecondaryTextColor"))
                        Spacer()
                    } else {
                        List {
                            ForEach(filteredItems) { item in
                                NavigationLink(destination: AssetDetailView(asset: item)) {
                                    AssetRow(item: item, activeSeason: appState.activeSeason, compact: true)
                                }
                                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                    if item.teamName != appState.userTeam {
                                        Button {
                                            appState.toggleInterest(for: item) { _ in }
                                        } label: {
                                            let interested = appState.interestedAssetIds.contains(item.assetId)
                                            Label(interested ? "Uninterested" : "Interested",
                                                  systemImage: interested ? "star.slash" : "star")
                                        }
                                        .tint(Color("AccentColor"))
                                    }
                                }
                                .listRowBackground(Color("CardBackgroundColor"))
                                .listRowInsets(EdgeInsets())
                                .overlay(
                                    VStack {
                                        Spacer()
                                        Rectangle().frame(height: 1)
                                            .foregroundColor(Color("TextColor")).padding(.leading, 12)
                                    }
                                )
                            }
                        }
                        .listStyle(PlainListStyle())
                        .background(Color("CardBackgroundColor"))
                    }
                }
            }
            .navigationTitle("Players & Picks")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

// MARK: - Shared Asset Row

struct AssetRow: View {
    let item: DisplayAsset
    let activeSeason: Int
    var compact: Bool = false

    private var scale: CGFloat { compact ? 0.75 : 1.0 }

    var body: some View {
        HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 3) {
                Text("   \(item.name)")
                    .font(.system(size: 18 * scale))
                    .foregroundColor(Color("TextColor")).bold()
                Text("   \(item.isPick ? "Round \(item.rookieRound ?? 0) · \(item.teamName)" : "\(item.position) · \(item.teamName)")")
                    .font(.system(size: 15 * scale))
                    .foregroundColor(Color("SecondaryTextColor"))
            }
            Spacer()
            Text(item.formattedCurrentPrice)
                .font(.system(size: 18 * scale))
                .foregroundColor(Color("Price2025Color")).bold()
        }
        .padding(.vertical, 12)
    }
}

// MARK: - Filter Section

struct FilterSection: View {
    @Binding var selectedTeams: Set<String>
    @Binding var selectedPositions: Set<String>
    @Binding var sortOption: String
    let allTeams: [String]
    let allPositions: [String]
    let sortOptions: [String]

    var body: some View {
        VStack(spacing: 15) {
            chipRow(label: "Teams", items: allTeams, selection: $selectedTeams)
            chipRow(label: "Positions", items: allPositions, selection: $selectedPositions)

            VStack(alignment: .leading) {
                Text("Sort").font(.headline).foregroundColor(Color("TextColor"))
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(sortOptions, id: \.self) { opt in
                            ChipView(text: opt, isSelected: sortOption == opt) { sortOption = opt }
                        }
                    }
                }
            }
            .padding(.horizontal)
        }
    }

    @ViewBuilder
    private func chipRow(label: String, items: [String], selection: Binding<Set<String>>) -> some View {
        VStack(alignment: .leading) {
            Text(label).font(.headline).foregroundColor(Color("TextColor"))
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(items, id: \.self) { item in
                        ChipView(text: item, isSelected: selection.wrappedValue.contains(item)) {
                            toggleFilter(&selection.wrappedValue, item: item, allItems: items)
                        }
                    }
                }
            }
        }
        .padding(.horizontal)
    }

    private func toggleFilter(_ selection: inout Set<String>, item: String, allItems: [String]) {
        if item == "All" {
            selection = selection.contains("All") ? [] : Set(allItems)
        } else {
            if selection.contains(item) { selection.remove(item) } else { selection.insert(item) }
            if selection.contains("All") && selection.count < allItems.count { selection.remove("All") }
            if !selection.contains("All") && selection.count == allItems.count - 1 { selection.insert("All") }
        }
    }
}

// MARK: - Chip View

struct ChipView: View {
    let text: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Text(text)
            .font(.caption).padding(8)
            .background(isSelected ? Color("AccentColor") : Color("SecondaryTextColor"))
            .foregroundColor(Color("BackgroundColor"))
            .clipShape(Capsule())
            .onTapGesture(perform: action)
    }
}

// MARK: - Asset Detail View (replaces PlayerDetailView + PickDetailView)

struct AssetDetailView: View {
    @EnvironmentObject var appState: AppState
    let asset: DisplayAsset

    var body: some View {
        ZStack {
            LinearGradient(
                gradient: Gradient(colors: [Color("BackgroundColor"), Color("CardBackgroundColor")]),
                startPoint: .top, endPoint: .bottom
            )
            .edgesIgnoringSafeArea(.all)

            ScrollView {
                VStack(alignment: .leading, spacing: 12) {

                    // Header
                    Text(asset.name)
                        .font(.title).fontWeight(.bold).foregroundColor(Color("TextColor"))
                    Text(asset.isPick
                         ? "Draft Pick · \(asset.teamName)"
                         : "\(asset.position) · \(asset.teamName)")
                        .font(.subheadline).foregroundColor(Color("SecondaryTextColor"))

                    Divider().background(Color("SecondaryTextColor"))

                    // Prices
                    Group {
                        priceRow(label: "\(appState.activeSeason) Price (Current)",
                                 value: "$\(asset.price(forSeason: appState.activeSeason))",
                                 color: Color("Price2025Color"))
                        priceRow(label: "\(appState.activeSeason + 1) Price",
                                 value: "$\(asset.price(forSeason: appState.activeSeason + 1))")
                        priceRow(label: "\(appState.activeSeason + 2) Price",
                                 value: "$\(asset.price(forSeason: appState.activeSeason + 2))")
                        if !asset.isPick {
                            priceRow(label: "Original Price", value: "$\(asset.originalPrice)")
                        }
                    }

                    Divider().background(Color("SecondaryTextColor"))

                    // Contract / acquisition info
                    if !asset.isPick {
                        Group {
                            infoRow(label: "Purchase Year",       value: asset.formattedPurchaseYear)
                            infoRow(label: "Contract Years Left", value: "\(asset.contractYearsRemaining)")
                            infoRow(label: "Player Pool",         value: asset.playerPool)
                            if let rr = asset.rookieRound, let ry = asset.rookieDraftYear {
                                infoRow(label: "Rookie Draft",    value: "\(ry) Round \(rr)")
                            }
                        }
                    } else {
                        Group {
                            infoRow(label: "Draft Season", value: "\(asset.rookieDraftYear ?? 0)")
                            infoRow(label: "Round",        value: "\(asset.rookieRound ?? 0)")
                        }
                    }

                    // Trade history
                    if !asset.tradeHistory.isEmpty {
                        Divider().background(Color("SecondaryTextColor"))
                        Text("Trade History")
                            .font(.headline).foregroundColor(Color("TextColor"))
                        ForEach(Array(asset.tradeHistory.enumerated()), id: \.offset) { _, note in
                            Text("• \(note)").font(.body).foregroundColor(Color("TextColor"))
                        }
                    }

                    // Trade shortcut
                    if asset.teamName != appState.userTeam {
                        Divider().background(Color("SecondaryTextColor"))
                        Button("Propose Trade for \(asset.name)") {
                            appState.selectedAssetForTrade = asset
                            appState.triggerTradeProposal = true
                        }
                        .buttonStyle(CustomButtonStyle())
                    }

                    Spacer()
                }
                .padding()
            }
        }
        .navigationTitle(asset.isPick ? "Pick Details" : asset.name)
        .navigationBarTitleDisplayMode(.inline)
    }

    private func priceRow(label: String, value: String, color: Color = Color("TextColor")) -> some View {
        HStack {
            Text(label).font(.body).foregroundColor(Color("SecondaryTextColor"))
            Spacer()
            Text(value).font(.body.bold()).foregroundColor(color)
        }
    }

    private func infoRow(label: String, value: String) -> some View {
        HStack {
            Text(label).font(.body).foregroundColor(Color("SecondaryTextColor"))
            Spacer()
            Text(value).font(.body).foregroundColor(Color("TextColor"))
        }
    }
}

// MARK: - Trades View

struct TradesView: View {
    @EnvironmentObject var appState: AppState
    @State private var searchQuery: String = ""

    private var currentSeasonTrades: [Trade] {
        appState.trades.filter {
            $0.season == appState.activeSeason &&
            ($0.status == .completed || $0.status == .historical)
        }
    }

    private var filteredTrades: [Trade] {
        guard !searchQuery.isEmpty else { return currentSeasonTrades }
        let q = searchQuery.lowercased()
        return currentSeasonTrades.filter {
            $0.proposingTeamName.lowercased().contains(q) ||
            $0.receivingTeamName.lowercased().contains(q) ||
            $0.proposerAssetNames.joined().lowercased().contains(q) ||
            $0.receiverAssetNames.joined().lowercased().contains(q)
        }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                LinearGradient(
                    gradient: Gradient(colors: [Color("BackgroundColor"), Color("CardBackgroundColor")]),
                    startPoint: .top, endPoint: .bottom
                )
                .edgesIgnoringSafeArea(.all)

                VStack(spacing: 0) {
                    Text("\(appState.activeSeason) Trades")
                        .font(.largeTitle).fontWeight(.bold)
                        .foregroundColor(Color("AccentColor"))
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.top, 20)

                    HStack {
                        TextField("", text: $searchQuery,
                                  prompt: Text("Search").foregroundColor(Color("SecondaryTextColor").opacity(0.7)))
                            .foregroundColor(Color("TextColor"))
                            .padding(7)
                            .background(Color("CardBackgroundColor"))
                            .cornerRadius(8)
                    }
                    .padding(.horizontal)
                    .padding(.bottom, 8)

                    ScrollView {
                        VStack(spacing: 12) {
                            ForEach(filteredTrades) { trade in
                                NavigationLink(destination: TradeDetailView(trade: trade)) {
                                    TradeRowView(trade: trade)
                                }
                            }
                        }
                        .padding()
                        .padding(.bottom, 80)
                    }

                    NavigationLink(destination: HistoricalTradesView()) {
                        Text("Historical Trades")
                            .font(.body).foregroundColor(.white).padding()
                            .frame(maxWidth: .infinity)
                            .background(Color("AccentColor")).cornerRadius(10)
                    }
                    .padding(.horizontal).padding(.bottom, 20)
                }
            }
            .navigationTitle("").navigationBarTitleDisplayMode(.inline)
        }
    }
}

struct TradeRowView: View {
    let trade: Trade
    var body: some View {
        HStack {
            Text("\(trade.formattedDate) · \(trade.proposingTeamName) & \(trade.receivingTeamName)")
                .font(.body).foregroundColor(Color("TextColor"))
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, 5)
    }
}

// MARK: - Trade Detail View

struct TradeDetailView: View {
    let trade: Trade

    var body: some View {
        ZStack {
            LinearGradient(
                gradient: Gradient(colors: [Color("BackgroundColor"), Color("CardBackgroundColor")]),
                startPoint: .top, endPoint: .bottom
            )
            .edgesIgnoringSafeArea(.all)

            VStack(alignment: .leading, spacing: 10) {
                Text("\(trade.formattedDate) · \(trade.proposingTeamName) & \(trade.receivingTeamName)")
                    .font(.title).foregroundColor(Color("TextColor"))

                Divider().background(Color("SecondaryTextColor"))

                HStack(alignment: .top, spacing: 20) {
                    VStack(alignment: .leading) {
                        Text("\(trade.receivingTeamName) Receives:")
                            .font(.headline).foregroundColor(Color("TextColor"))
                        ForEach(trade.proposerAssetNames, id: \.self) {
                            Text("• \($0)").font(.body).foregroundColor(Color("TextColor"))
                        }
                    }
                    VStack(alignment: .leading) {
                        Text("\(trade.proposingTeamName) Receives:")
                            .font(.headline).foregroundColor(Color("TextColor"))
                        ForEach(trade.receiverAssetNames, id: \.self) {
                            Text("• \($0)").font(.body).foregroundColor(Color("TextColor"))
                        }
                    }
                }

                if let notes = trade.notes, !notes.isEmpty {
                    Divider().background(Color("SecondaryTextColor"))
                    Text("Notes: \(notes)").font(.body).foregroundColor(Color("SecondaryTextColor"))
                }

                Spacer()
            }
            .padding()
        }
        .navigationTitle("Trade Details")
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Historical Trades View

struct HistoricalTradesView: View {
    @EnvironmentObject var appState: AppState

    private var seasons: [Int] {
        let years = Set(appState.trades.map { $0.season }).sorted(by: >)
        return Array(years)
    }

    var body: some View {
        NavigationStack {
            ZStack {
                LinearGradient(
                    gradient: Gradient(colors: [Color("BackgroundColor"), Color("CardBackgroundColor")]),
                    startPoint: .top, endPoint: .bottom
                )
                .edgesIgnoringSafeArea(.all)

                List {
                    ForEach(seasons, id: \.self) { season in
                        let trades = appState.trades.filter { $0.season == season && ($0.status == .completed || $0.status == .historical) }
                        if !trades.isEmpty {
                            NavigationLink(destination: SeasonTradesView(season: season, trades: trades)) {
                                Text(String(season))
                                    .font(.body).foregroundColor(Color("TextColor"))
                            }
                            .listRowBackground(Color("CardBackgroundColor"))
                        }
                    }
                }
                .listStyle(PlainListStyle())
                .background(Color("CardBackgroundColor"))
            }
            .navigationTitle("Historical Trades")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

struct SeasonTradesView: View {
    let season: Int
    let trades: [Trade]

    var body: some View {
        ZStack {
            LinearGradient(
                gradient: Gradient(colors: [Color("BackgroundColor"), Color("CardBackgroundColor")]),
                startPoint: .top, endPoint: .bottom
            )
            .edgesIgnoringSafeArea(.all)

            List {
                ForEach(trades.sorted { $0.date > $1.date }) { trade in
                    NavigationLink(destination: TradeDetailView(trade: trade)) {
                        TradeRowView(trade: trade)
                    }
                    .listRowBackground(Color("CardBackgroundColor"))
                }
            }
            .listStyle(PlainListStyle())
            .background(Color("CardBackgroundColor"))
        }
        .navigationTitle("\(season) Trades")
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Trade Proposal View

struct TradeProposalView: View {
    @EnvironmentObject var appState: AppState
    @State private var selectedOtherTeam: String? = nil
    @State private var selectedOfferedIds: Set<String>    = []
    @State private var selectedRequestedIds: Set<String>  = []
    @State private var showSuccess: Bool = false
    @State private var errorMsg: String = ""

    var body: some View {
        NavigationStack {
            ZStack {
                LinearGradient(
                    gradient: Gradient(colors: [Color("BackgroundColor"), Color("CardBackgroundColor")]),
                    startPoint: .top, endPoint: .bottom
                )
                .edgesIgnoringSafeArea(.all)

                VStack(spacing: 20) {
                    Picker("Select other team", selection: $selectedOtherTeam) {
                        Text("Select a team").tag(nil as String?)
                        ForEach(fantasyTeams.map { $0.name }.filter { $0 != appState.userTeam }, id: \.self) {
                            Text($0).tag($0 as String?)
                        }
                    }
                    .pickerStyle(MenuPickerStyle())
                    .foregroundColor(Color("TextColor"))

                    if let otherTeam = selectedOtherTeam {
                        let myAssets    = appState.allDisplayAssets.filter { $0.teamName == appState.userTeam }
                        let theirAssets = appState.allDisplayAssets.filter { $0.teamName == otherTeam }

                        ScrollView {
                            VStack(alignment: .leading, spacing: 16) {
                                assetPicker(
                                    title: "You Give (your assets)",
                                    assets: myAssets,
                                    selectedIds: $selectedOfferedIds
                                )
                                assetPicker(
                                    title: "You Want (\(otherTeam)'s assets)",
                                    assets: theirAssets,
                                    selectedIds: $selectedRequestedIds
                                )
                            }
                            .padding()
                        }
                    }

                    if showSuccess {
                        Text("✓ Proposal sent!").foregroundColor(.green).font(.subheadline)
                    }
                    if !errorMsg.isEmpty {
                        Text(errorMsg).foregroundColor(.red).font(.caption)
                    }

                    Button("Propose Trade") { submitProposal() }
                        .disabled(selectedOtherTeam == nil || selectedOfferedIds.isEmpty || selectedRequestedIds.isEmpty)
                        .buttonStyle(CustomButtonStyle())

                    Spacer()
                }
                .padding()
            }
            .navigationTitle("Trade Proposal")
            .navigationBarTitleDisplayMode(.inline)
            .onAppear { handleShortcut() }
        }
    }

    @ViewBuilder
    private func assetPicker(title: String, assets: [DisplayAsset], selectedIds: Binding<Set<String>>) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.headline).foregroundColor(Color("TextColor"))
            ForEach(assets.sorted { $0.currentPrice > $1.currentPrice }) { asset in
                HStack {
                    VStack(alignment: .leading) {
                        Text(asset.name).foregroundColor(Color("TextColor")).font(.subheadline)
                        Text(asset.isPick ? "Pick" : asset.position)
                            .foregroundColor(Color("SecondaryTextColor")).font(.caption)
                    }
                    Spacer()
                    Text(asset.formattedCurrentPrice).foregroundColor(Color("Price2025Color")).font(.subheadline)
                    if selectedIds.wrappedValue.contains(asset.id) {
                        Image(systemName: "checkmark.circle.fill").foregroundColor(Color("AccentColor"))
                    }
                }
                .contentShape(Rectangle())
                .onTapGesture {
                    if selectedIds.wrappedValue.contains(asset.id) {
                        selectedIds.wrappedValue.remove(asset.id)
                    } else {
                        selectedIds.wrappedValue.insert(asset.id)
                    }
                }
                .padding(.vertical, 4)
                Divider().background(Color("SecondaryTextColor"))
            }
        }
    }

    private func handleShortcut() {
        guard let asset = appState.selectedAssetForTrade, asset.teamName != appState.userTeam else { return }
        selectedOtherTeam = asset.teamName
        selectedRequestedIds.insert(asset.id)
        appState.selectedAssetForTrade = nil
    }

    private func submitProposal() {
        guard let otherTeam = selectedOtherTeam else { return }

        let allAssets = appState.allDisplayAssets
        let offeredRefs = selectedOfferedIds.compactMap { id -> TradeAssetRef? in
            guard let asset = allAssets.first(where: { $0.id == id }) else { return nil }
            return TradeAssetRef(assetType: asset.assetType, assetId: asset.id,
                                 displayName: asset.name, teamName: asset.teamName)
        }
        let requestedRefs = selectedRequestedIds.compactMap { id -> TradeAssetRef? in
            guard let asset = allAssets.first(where: { $0.id == id }) else { return nil }
            return TradeAssetRef(assetType: asset.assetType, assetId: asset.id,
                                 displayName: asset.name, teamName: asset.teamName)
        }

        let trade = Trade(
            id: nil,
            season: appState.activeSeason,
            date: Date(),
            status: .proposed,
            proposingTeamName: appState.userTeam,
            receivingTeamName: otherTeam,
            assetsFromProposer: offeredRefs,
            assetsFromReceiver: requestedRefs,
            notes: nil,
            completedAt: nil,
            response: nil,
            isHistorical: false,
            historicalProposerAssets: nil,
            historicalReceiverAssets: nil
        )

        appState.dataService.proposeTrade(trade) { error in
            DispatchQueue.main.async {
                if let e = error {
                    errorMsg = e.localizedDescription
                } else {
                    showSuccess = true
                    selectedOfferedIds.removeAll()
                    selectedRequestedIds.removeAll()
                    selectedOtherTeam = nil
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2) { showSuccess = false }
                }
            }
        }
    }
}
