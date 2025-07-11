import SwiftUI
import Firebase
import FirebaseMessaging
import FirebaseAuth
import GoogleAPIClientForREST

// MARK: - AppState
class AppState: ObservableObject {
    @Published var userTeam: String
    @Published var selectedTeam: String
    @Published var selectedPlayerForTrade: PlayerOrPick? = nil
    @Published var triggerTradeProposal: Bool = false
    @Published var allPlayersPicks: [PlayerOrPick] = []
    @Published var interestedAssets: Set<PlayerOrPick> = []
    private let sheetsService = SheetsService()
    private let firestoreService = FirestoreService()
    
    init() {
        var team: String
        if let user = Auth.auth().currentUser, !user.isAnonymous {
            let userEmailPrefix = user.email?.split(separator: "@").first ?? ""
            team = fantasyTeams.first { $0.name.contains(userEmailPrefix) }?.name ?? "Jared"
        } else {
            team = "Jared"
        }
        self.userTeam = team
        self.selectedTeam = team
        loadInterestedAssets()
    }
    
    func loadAllPlayersPicks() {
        sheetsService.fetchData(range: "2025 Master List!A2:M") { values in
            if let values = values {
                let newItems = values.map { PlayerOrPick(from: $0) }
                DispatchQueue.main.async {
                    self.allPlayersPicks = newItems
                }
            }
        }
    }
    
    func loadInterestedAssets() {
        guard let userId = Auth.auth().currentUser?.uid else { return }
        firestoreService.getPlayerInterests(for: userId) { interests, error in
            if let interests = interests {
                let assetIds = Set(interests.map { $0.assetId })
                DispatchQueue.main.async {
                    self.interestedAssets = Set(self.allPlayersPicks.filter { assetIds.contains($0.assetId) })
                }
            }
        }
    }
    
    func toggleInterest(for asset: PlayerOrPick, completion: @escaping (Error?) -> Void) {
        guard let userId = Auth.auth().currentUser?.uid else {
            completion(NSError(domain: "", code: -1, userInfo: [NSLocalizedDescriptionKey: "User not logged in"]))
            return
        }
        if interestedAssets.contains(asset) {
            firestoreService.removePlayerInterest(assetId: asset.assetId, userId: userId) { error in
                if error == nil {
                    DispatchQueue.main.async {
                        self.interestedAssets.remove(asset)
                    }
                }
                completion(error)
            }
        } else {
            let interest = PlayerInterest(id: nil, userId: userId, assetId: asset.assetId, timestamp: Date())
            firestoreService.addPlayerInterest(interest) { error in
                if error == nil {
                    DispatchQueue.main.async {
                        self.interestedAssets.insert(asset)
                    }
                }
                completion(error)
            }
        }
    }
}

// MARK: - AuthenticationService
class AuthenticationService: ObservableObject {
    @Published var isLoggedIn: Bool = false
    private var authHandle: AuthStateDidChangeListenerHandle?
    
    init() {
        authHandle = Auth.auth().addStateDidChangeListener { [weak self] _, user in
            self?.isLoggedIn = user != nil
        }
    }
    
    deinit {
        if let handle = authHandle {
            Auth.auth().removeStateDidChangeListener(handle)
        }
    }
    
    func signIn(email: String, password: String, completion: @escaping (AuthDataResult?, Error?) -> Void) {
        Auth.auth().signIn(withEmail: email, password: password, completion: completion)
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
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    
    init() {
        FirebaseApp.configure()
        UINavigationBar.appearance().barTintColor = UIColor(named: "BackgroundColor")
        UINavigationBar.appearance().titleTextAttributes = [.foregroundColor: UIColor(named: "TextColor") ?? .white]
        UITabBar.appearance().barTintColor = UIColor(named: "BackgroundColor")
        UITabBar.appearance().unselectedItemTintColor = UIColor(named: "SecondaryTextColor")
        UITabBar.appearance().tintColor = UIColor(named: "AccentColor")
    }
    
    var body: some Scene {
        WindowGroup {
            if authService.isLoggedIn {
                ContentView().environmentObject(AppState())
            } else {
                LoginView(authService: authService)
            }
        }
    }
}

// AppDelegate for FCM Setup
class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate, MessagingDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        Messaging.messaging().delegate = self
        
        // Request notification permissions
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
            if granted {
                DispatchQueue.main.async {
                    application.registerForRemoteNotifications()
                }
            } else if let error = error {
                print("Notification permission error: \(error)")
            }
        }
        return true
    }
    
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Messaging.messaging().apnsToken = deviceToken
    }
    
    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        if let token = fcmToken {
            print("FCM Token: \(token)")
            // Optionally store token in Firestore under user’s profile
            if let userId = Auth.auth().currentUser?.uid {
                Firestore.firestore().collection("users").document(userId).setData(["fcmToken": token], merge: true)
            }
        }
    }
    
    // Handle foreground notifications
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound])
    }
}

// MARK: - Login View
struct LoginView: View {
    @ObservedObject var authService: AuthenticationService
    @State private var email: String = ""
    @State private var password: String = ""
    @State private var errorMessage: String? = nil
    
    var body: some View {
        ZStack {
            LinearGradient(
                gradient: Gradient(colors: [Color("BackgroundColor"), Color("CardBackgroundColor")]),
                startPoint: .top,
                endPoint: .bottom
            )
            .edgesIgnoringSafeArea(.all)
            
            VStack(spacing: 20) {
                Text("Welcome to the IFFL")
                    .font(.largeTitle)
                    .fontWeight(.bold)
                    .foregroundColor(Color("TextColor"))
                
                TextField("Email", text: $email)
                    .textFieldStyle(CustomTextFieldStyle())
                    .keyboardType(.emailAddress)
                    .autocapitalization(.none)
                
                SecureField("Password", text: $password)
                    .textFieldStyle(CustomTextFieldStyle())
                
                if let error = errorMessage {
                    Text(error)
                        .foregroundColor(.red)
                        .font(.body)
                }
                
                Button("Login") {
                    authService.signIn(email: email, password: password) { result, error in
                        if let error = error {
                            errorMessage = error.localizedDescription
                        }
                    }
                }
                .buttonStyle(CustomButtonStyle())
                
                Button(action: {}) {
                    Text("Forgot Password?")
                        .font(.body)
                        .foregroundColor(Color("SecondaryTextColor"))
                }
                
                Spacer()
                
                VStack(spacing: 10) {
                    HStack {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundColor(Color("AccentColor"))
                        Text("WARNING: DEV ONLY")
                            .font(.caption)
                            .foregroundColor(.red)
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundColor(Color("AccentColor"))
                    }
                    Button(action: { authService.isLoggedIn = true }) {
                        Text("DO NOT PRESS")
                            .font(.body)
                            .foregroundColor(Color("TextColor"))
                            .padding()
                            .background(Color.red)
                            .clipShape(Capsule())
                    }
                    Text("Danger: Bypasses Security!")
                        .font(.caption)
                        .foregroundColor(.red)
                }
                .padding(.bottom, 20)
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
                .tabItem { Label("Home", systemImage: "house.fill") }
                .tag(0)
            TeamsView()
                .tabItem { Label("Teams", systemImage: "person.fill") }
                .tag(1)
            PlayersPicksView()
                .tabItem { Label("Players & Picks", systemImage: "person.3") }
                .tag(2)
            TradesView()
                .tabItem { Label("Trades", systemImage: "arrow.triangle.2.circlepath") }
                .tag(3)
            TradeProposalView()
                .tabItem { Label("Trade Proposal", systemImage: "person.2.fill") }
                .tag(4)
        }
        .accentColor(Color("AccentColor"))
        .onChange(of: appState.triggerTradeProposal) { trigger in
            if trigger {
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
    @State private var messages: [Message] = []
    private let firestoreService = FirestoreService()
    
    var body: some View {
        NavigationStack {
            ZStack {
                LinearGradient(
                    gradient: Gradient(colors: [Color("BackgroundColor"), Color("CardBackgroundColor")]),
                    startPoint: .top,
                    endPoint: .bottom
                )
                .edgesIgnoringSafeArea(.all)
                
                VStack(spacing: 0) {
                    Text("IFFL")
                        .font(.system(size: 50))
                        .fontWeight(.bold)
                        .foregroundColor(Color("TextColor"))
                        .overlay(
                            Text("IFFL")
                                .font(.system(size: 50))
                                .fontWeight(.bold)
                                .foregroundColor(Color("HomeTitleColor"))
                                .blur(radius: 0.5)
                                .offset(x: 1, y: 1)
                                .offset(x: -1, y: -1)
                                .offset(x: 1, y: -1)
                                .offset(x: -1, y: 1)
                        )
                        .padding(.top, 5)
                        .padding(.bottom, 5)
                    
                    Text("Insanity Fantasy Football League")
                        .font(.system(size: 20))
                        .foregroundColor(Color("TextColor"))
                        .padding(.bottom, 2)
                    
                    Text("EST. 2008")
                        .font(.system(size: 10))
                        .foregroundColor(Color("TextColor"))
                        .padding(.bottom, 2)
                    
                    ScrollView {
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 100))], spacing: 20) {
                            ForEach(fantasyTeams, id: \.name) { team in
                                NavigationLink(
                                    destination: TeamsView().onAppear {
                                        appState.selectedTeam = team.name
                                    }
                                ) {
                                    TeamIconView(team: team)
                                }
                            }
                        }
                        .padding()
                        
                        // League Messages Section
                        Text("League Messages")
                            .font(.headline)
                            .foregroundColor(Color("TextColor"))
                            .padding(.top, 20)
                        
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 10) {
                                ForEach(messages) { message in
                                    CardView {
                                        Text(message.content)
                                            .font(.body)
                                            .foregroundColor(Color("TextColor"))
                                            .padding()
                                    }
                                    .frame(width: 300)
                                }
                            }
                            .padding(.horizontal)
                        }
                    }
                    
                    Spacer()
                }
            }
            .navigationBarHidden(true)
            .onAppear {
                appState.loadAllPlayersPicks()
                loadMessages()
            }
        }
    }
    
    private func loadMessages() {
        firestoreService.listenToMessages { messages, error in
            if let messages = messages {
                DispatchQueue.main.async {
                    self.messages = messages
                }
            } else if let error = error {
                print("Error loading messages: \(error)")
            }
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
                    .resizable()
                    .scaledToFit()
                    .frame(width: 70, height: 70)
                Text(team.name)
                    .font(.body)
                    .foregroundColor(Color("TextColor"))
            }
        }
    }
}

// MARK: - Card View
struct CardView<Content: View>: View {
    let content: Content
    
    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }
    
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
    @StateObject private var sheetsService = SheetsService()
    @State private var items: [PlayerOrPick] = []
    @State private var isLoading: Bool = true
    @State private var errorMessage: String? = nil
    
    @ViewBuilder
    private func destinationView(for item: PlayerOrPick) -> some View {
        if item.isPick {
            PickDetailView(pick: item.toDraftPick())
        } else {
            PlayerDetailView(player: item.toRosterPlayer())
        }
    }
    
    var body: some View {
        NavigationStack {
            ZStack {
                LinearGradient(
                    gradient: Gradient(colors: [Color("BackgroundColor"), Color("CardBackgroundColor")]),
                    startPoint: .top,
                    endPoint: .bottom
                )
                .edgesIgnoringSafeArea(.all)
                
                VStack(spacing: 0) {
                    Picker("Select Team", selection: $appState.selectedTeam) {
                        ForEach(fantasyTeams.map { $0.name }, id: \.self) { team in
                            Text(team).tag(team)
                        }
                    }
                    .pickerStyle(MenuPickerStyle())
                    .font(.system(size: 50))
                    .foregroundColor(Color("TextColor"))
                    .padding(.top, 10)
                    .padding(.bottom, 10)
                    
                    if isLoading {
                        Text("Loading...")
                            .font(.body)
                            .foregroundColor(Color("SecondaryTextColor"))
                    } else if let error = errorMessage {
                        Text("Error: \(error)")
                            .foregroundColor(.red)
                    } else {
                        List {
                            ForEach(items.filter { $0.team.lowercased().contains(appState.selectedTeam.lowercased()) }) { item in
                                NavigationLink(destination: destinationView(for: item)) {
                                    HStack(spacing: 8) {
                                        VStack(alignment: .leading, spacing: 3) {
                                            Text("   \(item.name)")
                                                .font(.system(size: 12 * 1.5))
                                                .foregroundColor(Color("TextColor"))
                                                .bold()
                                            Text("   \(item.isPick ? "\(item.rookieRound) - \(item.team)" : "\(item.position) - \(item.team)")")
                                                .font(.system(size: 10 * 1.5))
                                                .foregroundColor(Color("SecondaryTextColor"))
                                        }
                                        Spacer()
                                        Text(item.price2025)
                                            .font(.system(size: 12 * 1.5))
                                            .foregroundColor(Color("Price2025Color"))
                                            .bold()
                                    }
                                    .padding(.vertical, 12)
                                }
                                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                    if item.team != appState.userTeam {
                                        Button {
                                            appState.toggleInterest(for: item) { error in
                                                if let error = error {
                                                    print("Error toggling interest: \(error)")
                                                }
                                            }
                                        } label: {
                                            Label(appState.interestedAssets.contains(item) ? "Uninterested" : "Interested", systemImage: appState.interestedAssets.contains(item) ? "star.slash" : "star")
                                        }
                                        .tint(Color("AccentColor"))
                                    }
                                }
                                .listRowBackground(Color("CardBackgroundColor"))
                                .listRowInsets(EdgeInsets())
                                .overlay(
                                    VStack {
                                        Spacer()
                                        Rectangle()
                                            .frame(height: 1)
                                            .foregroundColor(Color("TextColor"))
                                            .padding(.leading, 12)
                                    }
                                )
                            }
                        }
                        .listStyle(PlainListStyle())
                        .background(Color("CardBackgroundColor"))
                    }
                    Spacer()
                }
            }
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    EmptyView()
                }
            }
        }
        .onAppear {
            fetchData()
        }
    }
    
    private func fetchData() {
        sheetsService.fetchData(range: "2025 Master List!A2:M") { values in
            if let values = values {
                let newItems = values.map { PlayerOrPick(from: $0) }
                DispatchQueue.main.async {
                    self.items = newItems
                    self.isLoading = false
                }
            } else {
                DispatchQueue.main.async {
                    self.errorMessage = "Failed to load data"
                    self.isLoading = false
                }
            }
        }
    }
}

// MARK: - PlayersPicksView
struct PlayersPicksView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var sheetsService = SheetsService()
    @State private var items: [PlayerOrPick] = []
    @State private var searchPlayer: String = ""
    @State private var selectedTeams: Set<String> = ["All"]
    @State private var selectedPositions: Set<String> = ["All"]
    @State private var sortOption: String = "Highest"
    @State private var isLoading: Bool = true
    @State private var errorMessage: String? = nil
    
    private let allTeams = ["All"] + fantasyTeams.map { $0.name }
    private let allPositions = ["All", "QB", "RB", "WR", "TE", "Picks"]
    private let sortOptions = ["Highest", "Lowest"]
    
    private var filteredItems: [PlayerOrPick] {
        var result = items
        
        if !searchPlayer.isEmpty {
            result = result.filter { $0.name.lowercased().contains(searchPlayer.lowercased()) }
        }
        
        if !selectedTeams.contains("All") {
            result = result.filter { selectedTeams.contains($0.team) }
        }
        
        if !selectedPositions.contains("All") {
            result = result.filter { item in
                if selectedPositions.contains("Picks") && item.isPick {
                    return true
                }
                return selectedPositions.contains(item.position)
            }
        }
        
        return result.sorted { item1, item2 in
            let price1Str = item1.price2025.replacingOccurrences(of: "[^0-9]", with: "", options: .regularExpression)
            let price2Str = item2.price2025.replacingOccurrences(of: "[^0-9]", with: "", options: .regularExpression)
            let price1 = Int(price1Str) ?? 0
            let price2 = Int(price2Str) ?? 0
            return sortOption == "Highest" ? price1 > price2 : price1 < price2
        }
    }
    
    @ViewBuilder
    private func destinationView(for item: PlayerOrPick) -> some View {
        if item.isPick {
            PickDetailView(pick: item.toDraftPick())
        } else {
            PlayerDetailView(player: item.toRosterPlayer())
        }
    }
    
    var body: some View {
        NavigationStack {
            ZStack {
                LinearGradient(
                    gradient: Gradient(colors: [Color("BackgroundColor"), Color("CardBackgroundColor")]),
                    startPoint: .top,
                    endPoint: .bottom
                )
                .edgesIgnoringSafeArea(.all)
                
                VStack(spacing: 15) {
                    HStack {
                        TextField("Search Player", text: $searchPlayer)
                            .textFieldStyle(CustomTextFieldStyle())
                        if !searchPlayer.isEmpty {
                            Button(action: { searchPlayer = "" }) {
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
                    
                    if isLoading {
                        Text("Loading...")
                            .font(.body)
                            .foregroundColor(Color("SecondaryTextColor"))
                    } else if let error = errorMessage {
                        Text("Error: \(error)")
                            .foregroundColor(.red)
                    } else {
                        List {
                            ForEach(filteredItems) { item in
                                NavigationLink(destination: destinationView(for: item)) {
                                    HStack(spacing: 8) {
                                        VStack(alignment: .leading, spacing: 3) {
                                            Text("   \(item.name)")
                                                .font(.system(size: 12 * 1.5 * 0.75))
                                                .foregroundColor(Color("TextColor"))
                                                .bold()
                                            Text("   \(item.isPick ? "\(item.rookieRound) - \(item.team)" : "\(item.position) - \(item.team)")")
                                                .font(.system(size: 10 * 1.5 * 0.75))
                                                .foregroundColor(Color("SecondaryTextColor"))
                                        }
                                        Spacer()
                                        Text(item.price2025)
                                            .font(.system(size: 12 * 1.5 * 0.75))
                                            .foregroundColor(Color("Price2025Color"))
                                            .bold()
                                    }
                                    .padding(.vertical, 12)
                                }
                                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                    if item.team != appState.userTeam {
                                        Button {
                                            appState.toggleInterest(for: item) { error in
                                                if let error = error {
                                                    print("Error toggling interest: \(error)")
                                                }
                                            }
                                        } label: {
                                            Label(appState.interestedAssets.contains(item) ? "Uninterested" : "Interested", systemImage: appState.interestedAssets.contains(item) ? "star.slash" : "star")
                                        }
                                        .tint(Color("AccentColor"))
                                    }
                                }
                                .listRowBackground(Color("CardBackgroundColor"))
                                .listRowInsets(EdgeInsets())
                                .overlay(
                                    VStack {
                                        Spacer()
                                        Rectangle()
                                            .frame(height: 1)
                                            .foregroundColor(Color("TextColor"))
                                            .padding(.leading, 12)
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
        .onAppear {
            fetchData()
        }
    }
    
    private func fetchData() {
        sheetsService.fetchData(range: "2025 Master List!A2:M") { values in
            if let values = values {
                let newItems = values.map { PlayerOrPick(from: $0) }
                DispatchQueue.main.async {
                    self.items = newItems
                    self.isLoading = false
                }
            } else {
                DispatchQueue.main.async {
                    self.errorMessage = "Failed to load data"
                    self.isLoading = false
                }
            }
        }
    }
}

// MARK: - Filter Section (Updated)
struct FilterSection: View {
    @Binding var selectedTeams: Set<String>
    @Binding var selectedPositions: Set<String>
    @Binding var sortOption: String
    let allTeams: [String]
    let allPositions: [String]
    let sortOptions: [String]
    
    var body: some View {
        VStack(spacing: 15) {
            VStack(alignment: .leading) {
                Text("Teams")
                    .font(.headline)
                    .foregroundColor(Color("TextColor"))
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(allTeams, id: \.self) { team in
                            ChipView(text: team, isSelected: selectedTeams.contains(team)) {
                                toggleFilter(&selectedTeams, item: team, allItems: allTeams)
                            }
                        }
                    }
                }
            }
            .padding(.horizontal)
            
            VStack(alignment: .leading) {
                Text("Positions")
                    .font(.headline)
                    .foregroundColor(Color("TextColor"))
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(allPositions, id: \.self) { position in
                            ChipView(text: position, isSelected: selectedPositions.contains(position)) {
                                toggleFilter(&selectedPositions, item: position, allItems: allPositions)
                            }
                        }
                    }
                }
            }
            .padding(.horizontal)
            
            VStack(alignment: .leading) {
                Text("Sort")
                    .font(.headline)
                    .foregroundColor(Color("TextColor"))
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(sortOptions, id: \.self) { option in
                            ChipView(text: option, isSelected: sortOption == option) {
                                sortOption = option
                            }
                        }
                    }
                }
            }
            .padding(.horizontal)
        }
    }
    
    private func toggleFilter(_ selection: inout Set<String>, item: String, allItems: [String]) {
        if item == "All" {
            if selection.contains("All") {
                selection = []
            } else {
                selection = Set(allItems)
            }
        } else {
            if selection.contains(item) {
                selection.remove(item)
            } else {
                selection.insert(item)
            }
            if selection.contains("All") && selection.count < allItems.count {
                selection.remove("All")
            }
            if !selection.contains("All") && selection.count == allItems.count - 1 {
                selection.insert("All")
            }
        }
    }
}

// MARK: - Chip View (Updated)
struct ChipView: View {
    let text: String
    let isSelected: Bool
    let action: () -> Void
    
    var body: some View {
        Text(text)
            .font(.caption)
            .padding(8)
            .background(isSelected ? Color("AccentColor") : Color("SecondaryTextColor"))
            .foregroundColor(Color("BackgroundColor"))
            .clipShape(Capsule())
            .onTapGesture(perform: action)
    }
}

// MARK: - TradesView
struct TradesView: View {
    @StateObject private var sheetsService = SheetsService()
    @State private var tradesByYear: [String: [Trade]] = [:]
    @State private var isLoading: Bool = true
    @State private var errorMessage: String? = nil
    private let currentYear = "2025"
    
    var body: some View {
        NavigationStack {
            ZStack {
                LinearGradient(
                    gradient: Gradient(colors: [Color("BackgroundColor"), Color("CardBackgroundColor")]),
                    startPoint: .top,
                    endPoint: .bottom
                )
                .edgesIgnoringSafeArea(.all)
                
                VStack(spacing: 0) {
                    Text("\(currentYear) Trades")
                        .font(.largeTitle)
                        .fontWeight(.bold)
                        .foregroundColor(Color("AccentColor"))
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.top, 20)
                    
                    if isLoading {
                        Spacer()
                        Text("Loading...")
                            .font(.body)
                            .foregroundColor(Color("SecondaryTextColor"))
                        Spacer()
                    } else if let error = errorMessage {
                        Spacer()
                        Text("Error: \(error)")
                            .foregroundColor(.red)
                        Spacer()
                    } else {
                        ScrollView {
                            VStack(spacing: 20) {
                                if let currentYearTrades = tradesByYear[currentYear], !currentYearTrades.isEmpty {
                                    Section {
                                        ForEach(currentYearTrades.sorted(by: { compareDates($0.date, $1.date, ascending: false) })) { trade in
                                            NavigationLink(destination: TradeDetailView(trade: trade)) {
                                                HStack {
                                                    Text("\(trade.date) - \(trade.team1) & \(trade.team2)")
                                                        .font(.body)
                                                        .foregroundColor(Color("TextColor"))
                                                        .frame(maxWidth: .infinity, alignment: .leading)
                                                }
                                                .padding(.vertical, 5)
                                            }
                                        }
                                    }
                                    .padding(.horizontal)
                                }
                            }
                            .padding(.bottom, 100)
                        }
                    }
                    
                    NavigationLink(destination: HistoricalTradeDataView(tradesByYear: tradesByYear)) {
                        Text("Historical Trade Data")
                            .font(.body)
                            .foregroundColor(.white)
                            .padding()
                            .frame(maxWidth: .infinity)
                            .background(Color("AccentColor"))
                            .cornerRadius(10)
                    }
                    .padding(.horizontal)
                    .padding(.bottom, 20)
                }
            }
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
        }
        .onAppear {
            fetchData()
        }
    }
    
    private func fetchData() {
        sheetsService.fetchData(range: "Trades!A2:C") { values in
            if let values = values {
                var parsedTrades: [Trade] = []
                var currentDate = ""
                var team1 = ""
                var team2 = ""
                var team1Assets: [String] = []
                var team2Assets: [String] = []
                
                for row in values {
                    let date = row[0]
                    let colB = row.count > 1 ? row[1] : ""
                    let colC = row.count > 2 ? row[2] : ""
                    
                    if !date.isEmpty {
                        if !currentDate.isEmpty {
                            parsedTrades.append(Trade(date: currentDate, team1Receives: team1Assets, team2Receives: team2Assets, team1: team1, team2: team2))
                        }
                        currentDate = date
                        team1 = colB
                        team2 = colC
                        team1Assets = []
                        team2Assets = []
                    } else {
                        if !colB.isEmpty { team1Assets.append(colB) }
                        if !colC.isEmpty { team2Assets.append(colC) }
                    }
                }
                if !currentDate.isEmpty {
                    parsedTrades.append(Trade(date: currentDate, team1Receives: team1Assets, team2Receives: team2Assets, team1: team1, team2: team2))
                }
                
                let groupedTrades = Dictionary(grouping: parsedTrades) { trade in
                    let components = trade.date.split(separator: "/")
                    return components.count == 3 ? String(components[2]) : ""
                }.filter { $0.key != "" }
                
                DispatchQueue.main.async {
                    self.tradesByYear = groupedTrades
                    self.isLoading = false
                }
            } else {
                DispatchQueue.main.async {
                    self.errorMessage = "Failed to load trades"
                    self.isLoading = false
                }
            }
        }
    }
    
    private func compareDates(_ date1: String, _ date2: String, ascending: Bool) -> Bool {
        let formatter = DateFormatter()
        formatter.dateFormat = "M/d/yy"
        guard let d1 = formatter.date(from: date1), let d2 = formatter.date(from: date2) else { return false }
        return ascending ? d1 < d2 : d1 > d2
    }
}

// MARK: - Historical Trade Data View
struct HistoricalTradeDataView: View {
    let tradesByYear: [String: [Trade]]
    @State private var searchQuery: String = ""
    private let currentYear = 2025
    
    private var filteredTradesByYear: [String: [Trade]] {
        if searchQuery.isEmpty {
            return tradesByYear
        }
        
        var filtered: [String: [Trade]] = [:]
        for (year, trades) in tradesByYear {
            let matchingTrades = trades.filter { trade in
                let searchText = searchQuery.lowercased()
                return trade.date.lowercased().contains(searchText) ||
                       trade.team1.lowercased().contains(searchText) ||
                       trade.team2.lowercased().contains(searchText) ||
                       trade.team1Receives.joined(separator: " ").lowercased().contains(searchText) ||
                       trade.team2Receives.joined(separator: " ").lowercased().contains(searchText)
            }
            if !matchingTrades.isEmpty {
                filtered[year] = matchingTrades
            }
        }
        return filtered
    }
    
    var body: some View {
        NavigationStack {
            ZStack {
                LinearGradient(
                    gradient: Gradient(colors: [Color("BackgroundColor"), Color("CardBackgroundColor")]),
                    startPoint: .top,
                    endPoint: .bottom
                )
                .edgesIgnoringSafeArea(.all)
                
                VStack(spacing: 10) {
                    HStack {
                        TextField("", text: $searchQuery, prompt: Text("Search").foregroundColor(Color("SecondaryTextColor").opacity(0.7)))
                            .foregroundColor(Color("TextColor"))
                            .padding(7)
                            .background(Color("CardBackgroundColor"))
                            .cornerRadius(8)
                    }
                    .padding(.horizontal)
                    .padding(.top, 10)
                    
                    List {
                        let startYear = currentYear - 3
                        let endYear = currentYear - 1
                        ForEach((startYear...endYear).reversed(), id: \.self) { year in
                            if let yearTrades = filteredTradesByYear[String(year)], !yearTrades.isEmpty {
                                NavigationLink(destination: TradeHistoryView(year: String(year), trades: yearTrades)) {
                                    Text(String(year))
                                        .font(.body)
                                        .foregroundColor(Color("TextColor"))
                                }
                                .listRowBackground(Color("CardBackgroundColor"))
                            }
                        }
                    }
                    .listStyle(PlainListStyle())
                    .background(Color("CardBackgroundColor"))
                }
            }
            .navigationTitle("Historical Trade Data")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Text("Historical Trade Data")
                        .foregroundColor(Color("TextColor"))
                }
            }
        }
    }
}

// MARK: - Trade History View
struct TradeHistoryView: View {
    let year: String
    let trades: [Trade]
    
    var body: some View {
        NavigationStack {
            ZStack {
                LinearGradient(
                    gradient: Gradient(colors: [Color("BackgroundColor"), Color("CardBackgroundColor")]),
                    startPoint: .top,
                    endPoint: .bottom
                )
                .edgesIgnoringSafeArea(.all)
                
                List {
                    ForEach(trades.sorted(by: { compareDates($0.date, $1.date, ascending: true) })) { trade in
                        NavigationLink(destination: TradeDetailView(trade: trade)) {
                            HStack {
                                Text("\(trade.date) - \(trade.team1) & \(trade.team2)")
                                    .font(.body)
                                    .foregroundColor(Color("TextColor"))
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }
                        .listRowBackground(Color("CardBackgroundColor"))
                    }
                }
                .listStyle(PlainListStyle())
                .background(Color("CardBackgroundColor"))
            }
            .navigationTitle("\(year) Trades")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Text("\(year) Trades")
                        .foregroundColor(Color("TextColor"))
                }
            }
        }
    }
    
    private func compareDates(_ date1: String, _ date2: String, ascending: Bool) -> Bool {
        let formatter = DateFormatter()
        formatter.dateFormat = "M/d/yy"
        guard let d1 = formatter.date(from: date1), let d2 = formatter.date(from: date2) else { return false }
        return ascending ? d1 < d2 : d1 > d2
    }
}

// MARK: - Trade Detail View
struct TradeDetailView: View {
    let trade: Trade
    
    var body: some View {
        ZStack {
            LinearGradient(
                gradient: Gradient(colors: [Color("BackgroundColor"), Color("CardBackgroundColor")]),
                startPoint: .top,
                endPoint: .bottom
            )
            .edgesIgnoringSafeArea(.all)
            
            VStack(alignment: .leading, spacing: 10) {
                Text("\(trade.date) - \(trade.team1) & \(trade.team2)")
                    .font(.title)
                    .foregroundColor(Color("TextColor"))
                
                Divider()
                    .background(Color("SecondaryTextColor"))
                
                HStack(alignment: .top, spacing: 20) {
                    VStack(alignment: .leading) {
                        Text("\(trade.team1) Receives:")
                            .font(.headline)
                            .foregroundColor(Color("TextColor"))
                        ForEach(trade.team1Receives, id: \.self) { asset in
                            Text("• \(asset)")
                                .font(.body)
                                .foregroundColor(Color("TextColor"))
                        }
                    }
                    VStack(alignment: .leading) {
                        Text("\(trade.team2) Receives:")
                            .font(.headline)
                            .foregroundColor(Color("TextColor"))
                        ForEach(trade.team2Receives, id: \.self) { asset in
                            Text("• \(asset)")
                                .font(.body)
                                .foregroundColor(Color("TextColor"))
                        }
                    }
                }
                
                Spacer()
            }
            .padding()
        }
        .navigationTitle("Trade Details")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Text("Trade Details")
                    .foregroundColor(Color("TextColor"))
            }
        }
    }
}

// MARK: - Trade Proposal View
struct TradeProposalView: View {
    @EnvironmentObject var appState: AppState
    @State private var selectedOtherTeam: String? = nil
    @State private var selectedOfferedAssets: Set<String> = []
    @State private var selectedRequestedAssets: Set<String> = []
    private let firestoreService = FirestoreService()
    
    var body: some View {
        NavigationStack {
            ZStack {
                LinearGradient(
                    gradient: Gradient(colors: [Color("BackgroundColor"), Color("CardBackgroundColor")]),
                    startPoint: .top,
                    endPoint: .bottom
                )
                .edgesIgnoringSafeArea(.all)
                
                VStack(spacing: 20) {
                    Picker("Select other team", selection: $selectedOtherTeam) {
                        Text("Select a team").tag(nil as String?)
                        ForEach(fantasyTeams.map { $0.name }.filter { $0 != appState.userTeam }, id: \.self) { team in
                            Text(team).tag(team as String?)
                        }
                    }
                    .pickerStyle(MenuPickerStyle())
                    
                    if let otherTeam = selectedOtherTeam {
                        let userAssets = appState.allPlayersPicks.filter { $0.team == appState.userTeam }
                        let otherAssets = appState.allPlayersPicks.filter { $0.team == otherTeam }
                        
                        Section(header: Text("Select assets to offer").font(.headline)) {
                            List {
                                ForEach(userAssets) { asset in
                                    HStack {
                                        Text(asset.name)
                                        Spacer()
                                        if selectedOfferedAssets.contains(asset.assetId) {
                                            Image(systemName: "checkmark")
                                        }
                                    }
                                    .contentShape(Rectangle())
                                    .onTapGesture {
                                        if selectedOfferedAssets.contains(asset.assetId) {
                                            selectedOfferedAssets.remove(asset.assetId)
                                        } else {
                                            selectedOfferedAssets.insert(asset.assetId)
                                        }
                                    }
                                }
                            }
                        }
                        
                        Section(header: Text("Select assets to request").font(.headline)) {
                            List {
                                ForEach(otherAssets) { asset in
                                    HStack {
                                        Text(asset.name)
                                        Spacer()
                                        if selectedRequestedAssets.contains(asset.assetId) {
                                            Image(systemName: "checkmark")
                                        }
                                    }
                                    .contentShape(Rectangle())
                                    .onTapGesture {
                                        if selectedRequestedAssets.contains(asset.assetId) {
                                            selectedRequestedAssets.remove(asset.assetId)
                                        } else {
                                            selectedRequestedAssets.insert(asset.assetId)
                                        }
                                    }
                                }
                            }
                        }
                        
                        Button("Propose Trade") {
                            let proposal = TradeProposal(
                                id: nil,
                                proposer: appState.userTeam,
                                recipient: otherTeam,
                                offeredAssetIds: Array(selectedOfferedAssets),
                                requestedAssetIds: Array(selectedRequestedAssets),
                                status: "pending",
                                response: nil,
                                timestamp: Date()
                            )
                            firestoreService.addTradeProposal(proposal) { error in
                                if let error = error {
                                    print("Error proposing trade: \(error)")
                                } else {
                                    // Trigger notification (placeholder; requires server-side)
                                    firestoreService.sendPushNotification(
                                        to: "recipient_fcm_token",
                                        title: "New Trade Proposal",
                                        body: "\(appState.userTeam) proposed a trade."
                                    )
                                    // Clear selections
                                    selectedOfferedAssets.removeAll()
                                    selectedRequestedAssets.removeAll()
                                    selectedOtherTeam = nil
                                }
                            }
                        }
                        .disabled(selectedOfferedAssets.isEmpty || selectedRequestedAssets.isEmpty)
                        .buttonStyle(CustomButtonStyle())
                    }
                    Spacer()
                }
                .padding()
            }
            .navigationTitle("Trade Proposal")
            .navigationBarTitleDisplayMode(.inline)
            .onAppear {
                if let player = appState.selectedPlayerForTrade, player.team != appState.userTeam {
                    selectedOtherTeam = player.team
                    selectedRequestedAssets.insert(player.assetId)
                    appState.selectedPlayerForTrade = nil
                }
            }
        }
    }
}

// MARK: - Trade Proposals Feedback View
struct TradeProposalsFeedbackView: View {
    @EnvironmentObject var appState: AppState
    @State private var proposals: [TradeProposal] = []
    private let firestoreService = FirestoreService()
    
    var body: some View {
        NavigationStack {
            ZStack {
                LinearGradient(
                    gradient: Gradient(colors: [Color("BackgroundColor"), Color("CardBackgroundColor")]),
                    startPoint: .top,
                    endPoint: .bottom
                )
                .edgesIgnoringSafeArea(.all)
                
                VStack(spacing: 20) {
                    Text("Pending Trade Proposals")
                        .font(.title)
                        .foregroundColor(Color("TextColor"))
                    
                    if proposals.isEmpty {
                        Text("No pending proposals")
                            .font(.body)
                            .foregroundColor(Color("SecondaryTextColor"))
                    } else {
                        List {
                            ForEach(proposals) { proposal in
                                CardView {
                                    VStack(alignment: .leading, spacing: 10) {
                                        Text("From: \(proposal.proposer)")
                                            .font(.headline)
                                        Text("Offered: \(proposal.offeredAssetIds.joined(separator: ", "))")
                                        Text("Requested: \(proposal.requestedAssetIds.joined(separator: ", "))")
                                        HStack {
                                            Button("Yes") {
                                                respondToProposal(proposal, response: "yes", status: "accepted")
                                            }
                                            .buttonStyle(CustomButtonStyle())
                                            Button("No") {
                                                respondToProposal(proposal, response: "no", status: "rejected")
                                            }
                                            .buttonStyle(CustomButtonStyle())
                                            Button("Maybe") {
                                                respondToProposal(proposal, response: "maybe", status: "pending")
                                            }
                                            .buttonStyle(CustomButtonStyle())
                                        }
                                    }
                                    .padding()
                                }
                            }
                        }
                        .listStyle(PlainListStyle())
                    }
                    Spacer()
                }
                .padding()
            }
            .navigationTitle("Trade Proposals")
            .navigationBarTitleDisplayMode(.inline)
            .onAppear {
                loadProposals()
            }
        }
    }
    
    private func loadProposals() {
        firestoreService.getTradeProposals(for: appState.userTeam) { proposals, error in
            if let proposals = proposals {
                DispatchQueue.main.async {
                    self.proposals = proposals
                }
            } else if let error = error {
                print("Error loading proposals: \(error)")
            }
        }
    }
    
    private func respondToProposal(_ proposal: TradeProposal, response: String, status: String) {
        guard let id = proposal.id else { return }
        firestoreService.updateTradeProposalResponse(proposalId: id, response: response, status: status) { error in
            if let error = error {
                print("Error responding to proposal: \(error)")
            } else {
                // Trigger notification (placeholder)
                firestoreService.sendPushNotification(
                    to: "proposer_fcm_token",
                    title: "Trade Proposal Response",
                    body: "\(appState.userTeam) responded: \(response)"
                )
                // Reload proposals
                loadProposals()
            }
        }
    }
}

// MARK: - Player Detail View
struct PlayerDetailView: View {
    let player: RosterPlayer
    
    var body: some View {
        ZStack {
            LinearGradient(
                gradient: Gradient(colors: [Color("BackgroundColor"), Color("CardBackgroundColor")]),
                startPoint: .top,
                endPoint: .bottom
            )
            .edgesIgnoringSafeArea(.all)
            
            VStack(alignment: .leading, spacing: 10) {
                Text(player.player)
                    .font(.title)
                    .foregroundColor(Color("TextColor"))
                Text("\(player.position) - \(player.team)")
                    .font(.subheadline)
                    .foregroundColor(Color("SecondaryTextColor"))
                
                Divider()
                    .background(Color("SecondaryTextColor"))
                
                Group {
                    Text("2025 Price: \(player.price2025)")
                        .font(.body)
                        .foregroundColor(Color("Price2025Color"))
                    Text("2026 Price: \(player.price2026)")
                        .font(.body)
                        .foregroundColor(Color("TextColor"))
                    Text("2027 Price: \(player.price2027)")
                        .font(.body)
                        .foregroundColor(Color("TextColor"))
                    Text("Original Price: \(player.originalPrice)")
                        .font(.body)
                        .foregroundColor(Color("TextColor"))
                }
                
                Divider()
                    .background(Color("SecondaryTextColor"))
                
                Group {
                    Text("Purchase Year: \(player.formattedPurchaseYear)")
                    Text("Contract Year: \(player.contractYear)")
                    Text("Player Pool: \(player.playerPool)")
                }
                .font(.body)
                .foregroundColor(Color("TextColor"))
                
                Spacer()
            }
            .padding()
        }
        .navigationTitle(player.player)
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Pick Detail View
struct PickDetailView: View {
    let pick: DraftPick
    
    var body: some View {
        ZStack {
            LinearGradient(
                gradient: Gradient(colors: [Color("BackgroundColor"), Color("CardBackgroundColor")]),
                startPoint: .top,
                endPoint: .bottom
            )
            .edgesIgnoringSafeArea(.all)
            
            VStack(alignment: .leading, spacing: 10) {
                Text("\(pick.round) - \(pick.team)")
                    .font(.title)
                    .foregroundColor(Color("TextColor"))
                Divider()
                    .background(Color("SecondaryTextColor"))
                
                Text("Price: \(pick.price)")
                    .font(.body)
                    .foregroundColor(Color("Price2025Color"))
                
                VStack(alignment: .leading) {
                    Text("Trade History:")
                        .font(.headline)
                        .foregroundColor(Color("TextColor"))
                    if let tradeHistory = pick.tradeHistory {
                        Text(tradeHistory)
                            .font(.body)
                            .foregroundColor(Color("TextColor"))
                    } else {
                        Text("No trade history available.")
                            .font(.body)
                            .foregroundColor(Color("SecondaryTextColor"))
                    }
                }
                
                Spacer()
            }
            .padding()
        }
        .navigationTitle("Pick Details")
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Data Models
struct FantasyTeam {
    let name: String
    let color: Color
    let logo: String
}

let fantasyTeams: [FantasyTeam] = [
    FantasyTeam(name: "A. Zurek", color: .red, logo: "AZurekLogo"),
    FantasyTeam(name: "Abad", color: .blue, logo: "AbadLogo"),
    FantasyTeam(name: "Bill", color: .green, logo: "BillLogo"),
    FantasyTeam(name: "Cantone", color: .purple, logo: "CantoneLogo"),
    FantasyTeam(name: "Dugan", color: .orange, logo: "DuganLogo"),
    FantasyTeam(name: "Faybik", color: .yellow, logo: "FaybikLogo"),
    FantasyTeam(name: "Foley", color: .pink, logo: "FoleyLogo"),
    FantasyTeam(name: "Jared", color: .cyan, logo: "JaredLogo"),
    FantasyTeam(name: "Jason", color: .indigo, logo: "JasonLogo"),
    FantasyTeam(name: "M. Zurek", color: .teal, logo: "MZurekLogo"),
    FantasyTeam(name: "Ryan", color: .mint, logo: "RyanLogo"),
    FantasyTeam(name: "Wayne", color: .brown, logo: "WayneLogo")
]

struct PlayerOrPick: Identifiable, Hashable {
    let id = UUID()
    let team: String
    let position: String
    let name: String
    let price2025: String
    let price2026: String
    let price2027: String
    let originalPrice: String
    let purchaseYear: Int
    let contractYear: String
    let playerPool: String
    let rookieRound: String
    let draftYear: String
    let tradeHistory: String
    
    var assetId: String { "\(team)-\(name)" }
    
    init(from array: [String]) {
        self.team = array[0].trimmingCharacters(in: .whitespacesAndNewlines)
        self.position = array[1]
        self.name = array[2]
        self.price2025 = array.count > 3 ? array[3] : "$0"
        self.price2026 = array.count > 4 ? array[4] : ""
        self.price2027 = array.count > 5 ? array[5] : ""
        self.originalPrice = array.count > 6 ? array[6] : ""
        self.purchaseYear = array.count > 7 ? Int(array[7]) ?? 0 : 0
        self.contractYear = array.count > 8 ? array[8] : ""
        self.playerPool = array.count > 9 ? array[9] : ""
        self.rookieRound = array.count > 10 ? array[10] : ""
        self.draftYear = array.count > 11 ? array[11] : ""
        self.tradeHistory = array.count > 12 ? array[12] : ""
    }
    
    var isPick: Bool {
        !rookieRound.isEmpty || !draftYear.isEmpty
    }
    
    func toRosterPlayer() -> RosterPlayer {
        RosterPlayer(
            team: team,
            position: position,
            player: name,
            price2025: price2025,
            price2026: price2026,
            price2027: price2027,
            originalPrice: originalPrice,
            purchaseYear: purchaseYear,
            contractYear: contractYear,
            playerPool: playerPool
        )
    }
    
    func toDraftPick() -> DraftPick {
        DraftPick(
            round: rookieRound,
            price: price2025,
            playerName: name.contains("Pick") ? nil : name,
            nflTeam: nil,
            team: team,
            tradeHistory: tradeHistory.isEmpty ? nil : tradeHistory
        )
    }
    
    static func == (lhs: PlayerOrPick, rhs: PlayerOrPick) -> Bool {
        lhs.id == rhs.id
    }
    
    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }
}

struct RosterPlayer: Identifiable, Hashable {
    let id = UUID()
    let team: String
    let position: String
    let player: String
    let price2025: String
    let price2026: String
    let price2027: String
    let originalPrice: String
    let purchaseYear: Int
    let contractYear: String
    let playerPool: String
    
    var formattedPurchaseYear: String {
        String(format: "%04d", purchaseYear)
    }
}

struct DraftPick: Identifiable, Hashable {
    let id = UUID()
    let round: String
    let price: String
    let playerName: String?
    let nflTeam: String?
    let team: String
    let tradeHistory: String?
}

struct Trade: Identifiable {
    let id = UUID()
    let date: String
    let team1Receives: [String]
    let team2Receives: [String]
    let team1: String
    let team2: String
}

struct PlayerInterest: Identifiable, Codable {
    @DocumentID var id: String?
    let userId: String
    let assetId: String
    let timestamp: Date
    
    enum CodingKeys: String, CodingKey {
        case id
        case userId
        case assetId
        case timestamp
    }
}

struct TradeProposal: Identifiable, Codable {
    @DocumentID var id: String?
    let proposer: String
    let recipient: String
    let offeredAssetIds: [String]
    let requestedAssetIds: [String]
    var status: String  // e.g., "pending", "accepted", "rejected"
    var response: String?  // e.g., "yes", "no", "maybe"
    let timestamp: Date
    
    enum CodingKeys: String, CodingKey {
        case id
        case proposer
        case recipient
        case offeredAssetIds
        case requestedAssetIds
        case status
        case response
        case timestamp
    }
}

struct Message: Identifiable, Codable {
    @DocumentID var id: String?
    let content: String
    let timestamp: Date
    
    enum CodingKeys: String, CodingKey {
        case id
        case content
        case timestamp
    }
}

// MARK: - Sheets Service with Caching
class SheetsService: ObservableObject {
    private let service = GTLRSheetsService()
    private let spreadsheetId = "1diqlEkrYHga4Txtf3ZK34DVe9fcR7qE8TfI6F-IfiqI"
    private let apiKey = "AIzaSyBaYKsIYHJR-pJX0aMTsJFZvz7ji8ZW8_4"
    private var cache: [String: [[String]]] = [:]
    
    init() {
        service.apiKey = apiKey
        service.shouldFetchNextPages = true
    }
    
    func fetchData(range: String, completion: @escaping ([[String]]?) -> Void) {
        if let cachedValues = cache[range] {
            completion(cachedValues)
            return
        }
        
        let query = GTLRSheetsQuery_SpreadsheetsValuesGet.query(withSpreadsheetId: spreadsheetId, range: range)
        service.executeQuery(query) { _, result, error in
            if let valueRange = result as? GTLRSheets_ValueRange, let values = valueRange.values as? [[String]] {
                self.cache[range] = values
                completion(values)
            } else {
                completion(nil)
            }
        }
    }
}

// MARK: - Firestore Service
class FirestoreService: ObservableObject {
    private let db = Firestore.firestore()
    
    // Add Player Interest
    func addPlayerInterest(_ interest: PlayerInterest, completion: @escaping (Error?) -> Void) {
        do {
            _ = try db.collection("playerInterests").addDocument(from: interest, completion: completion)
        } catch {
            completion(error)
        }
    }
    
    // Remove Player Interest
    func removePlayerInterest(assetId: String, userId: String, completion: @escaping (Error?) -> Void) {
        db.collection("playerInterests")
            .whereField("assetId", isEqualTo: assetId)
            .whereField("userId", isEqualTo: userId)
            .getDocuments { snapshot, error in
                if let error = error {
                    completion(error)
                    return
                }
                guard let documents = snapshot?.documents else {
                    completion(nil)
                    return
                }
                for document in documents {
                    document.reference.delete(completion: completion)
                }
            }
    }
    
    // Get Player Interests for User
    func getPlayerInterests(for userId: String, completion: @escaping ([PlayerInterest]?, Error?) -> Void) {
        db.collection("playerInterests")
            .whereField("userId", isEqualTo: userId)
            .getDocuments { snapshot, error in
                if let error = error {
                    completion(nil, error)
                } else {
                    let interests = snapshot?.documents.compactMap { try? $0.data(as: PlayerInterest.self) }
                    completion(interests, nil)
                }
            }
    }
    
    // Add Trade Proposal
    func addTradeProposal(_ proposal: TradeProposal, completion: @escaping (Error?) -> Void) {
        do {
            _ = try db.collection("tradeProposals").addDocument(from: proposal, completion: completion)
        } catch {
            completion(error)
        }
    }
    
    // Update Trade Proposal Response
    func updateTradeProposalResponse(proposalId: String, response: String, status: String, completion: @escaping (Error?) -> Void) {
        db.collection("tradeProposals").document(proposalId).updateData([
            "response": response,
            "status": status
        ], completion: completion)
    }
    
    // Get Trade Proposals for Team
    func getTradeProposals(for team: String, completion: @escaping ([TradeProposal]?, Error?) -> Void) {
        db.collection("tradeProposals")
            .whereField("recipient", isEqualTo: team)
            .whereField("status", isEqualTo: "pending")
            .getDocuments { snapshot, error in
                if let error = error {
                    completion(nil, error)
                } else {
                    let proposals = snapshot?.documents.compactMap { try? $0.data(as: TradeProposal.self) }
                    completion(proposals, nil)
                }
            }
    }
    
    // Add Message
    func addMessage(_ message: Message, completion: @escaping (Error?) -> Void) {
        do {
            _ = try db.collection("messages").addDocument(from: message, completion: completion)
        } catch {
            completion(error)
        }
    }
    
    // Get Messages with Real-Time Updates
    func listenToMessages(completion: @escaping ([Message]?, Error?) -> Void) {
        db.collection("messages")
            .order(by: "timestamp", descending: true)
            .limit(to: 10)
            .addSnapshotListener { snapshot, error in
                if let error = error {
                    completion(nil, error)
                } else {
                    let messages = snapshot?.documents.compactMap { try? $0.data(as: Message.self) }
                    completion(messages, nil)
                }
            }
    }
    
    // Send Push Notification
    func sendPushNotification(to fcmToken: String, title: String, body: String) {
        // Note: This requires server-side implementation (e.g., Firebase Cloud Functions).
        // For testing, use Firebase Console or implement a Cloud Function.
        print("Sending notification to \(fcmToken): \(title) - \(body)")
    }
}
