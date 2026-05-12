import SwiftUI
import Firebase
import FirebaseMessaging
import FirebaseAuth
import FirebaseFirestore
import GoogleSignIn

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
    @Published var allLeagueInterests: [PlayerInterest] = []

    @Published var selectedAssetForTrade: DisplayAsset? = nil
    @Published var triggerTradeProposal: Bool = false

    let dataService = FirestoreDataService()

    private var playerListener:  ListenerRegistration?
    private var pickListener:    ListenerRegistration?
    private var tradeListener:   ListenerRegistration?
    private var messageListener: ListenerRegistration?

    var currentUserUID: String? { Auth.auth().currentUser?.uid }

    var allDisplayAssets: [DisplayAsset] {
        let playerAssets = players.map { $0.toDisplayAsset(activeSeason: activeSeason) }
        let pickAssets   = draftPicks.map { $0.toDisplayAsset(activeSeason: activeSeason) }
        return playerAssets + pickAssets
    }

    // MARK: Setup / Teardown

    func setup(for user: User) {
        dataService.fetchLeagueConfig { [weak self] config in
            guard let self else { return }
            DispatchQueue.main.async {
                self.activeSeason   = config?.activeSeasonYear ?? 2026
                self.isCommissioner = config?.authorizedUIDs.contains(user.uid) ?? false

                if let team = config?.userTeamMap[user.uid] {
                    self.userTeam    = team
                    self.selectedTeam = team
                } else {
                    let prefix = user.email?.split(separator: "@").first.map(String.init)?.lowercased() ?? ""
                    let team = config?.teamEmailMap[prefix]
                        ?? fantasyTeams.first { $0.name.lowercased().contains(prefix) }?.name
                        ?? fantasyTeams.first?.name ?? "Unknown"
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

    func loadAllLeagueInterests() {
        dataService.fetchAllInterests { [weak self] interests, _ in
            guard let self, let interests else { return }
            DispatchQueue.main.async { self.allLeagueInterests = interests }
        }
    }

    func toggleInterest(for asset: DisplayAsset, completion: @escaping (Error?) -> Void) {
        guard let uid = currentUserUID else {
            completion(NSError(domain: "IFFL", code: -1))
            return
        }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        if interestedAssetIds.contains(asset.assetId) {
            dataService.removePlayerInterest(assetId: asset.assetId, userId: uid) { [weak self] error in
                if error == nil { DispatchQueue.main.async { self?.interestedAssetIds.remove(asset.assetId) } }
                completion(error)
            }
        } else {
            let interest = PlayerInterest(id: nil, userId: uid, assetId: asset.assetId,
                                          timestamp: Date(), teamName: userTeam)
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
    @Published var signInError: String? = nil
    private var handle: AuthStateDidChangeListenerHandle?

    init() {
        handle = Auth.auth().addStateDidChangeListener { [weak self] _, user in
            DispatchQueue.main.async { self?.isLoggedIn = user != nil }
        }
        if let clientID = FirebaseApp.app()?.options.clientID {
            GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientID)
        }
    }

    deinit {
        if let h = handle { Auth.auth().removeStateDidChangeListener(h) }
    }

    func signInWithGoogle() {
        if GIDSignIn.sharedInstance.configuration == nil,
           let clientID = FirebaseApp.app()?.options.clientID {
            GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientID)
        }

        guard let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let rootVC = windowScene.windows.first?.rootViewController else { return }

        GIDSignIn.sharedInstance.signIn(withPresenting: rootVC) { [weak self] result, error in
            guard let self else { return }
            if let error = error {
                let nsError = error as NSError
                if nsError.domain == kGIDSignInErrorDomain && nsError.code == -5 { return }
                print("[Auth] GIDSignIn error domain=\(nsError.domain) code=\(nsError.code) userInfo=\(nsError.userInfo)")
                DispatchQueue.main.async { self.signInError = error.localizedDescription }
                return
            }
            guard let user = result?.user,
                  let idToken = user.idToken?.tokenString else {
                print("[Auth] GIDSignIn returned no user/idToken")
                return
            }
            let credential = GoogleAuthProvider.credential(
                withIDToken: idToken,
                accessToken: user.accessToken.tokenString
            )
            Auth.auth().signIn(with: credential) { _, error in
                if let error = error as NSError? {
                    print("[Auth] Firebase signIn error domain=\(error.domain) code=\(error.code)")
                    print("[Auth] localizedDescription: \(error.localizedDescription)")
                    print("[Auth] userInfo: \(error.userInfo)")
                    let detail = (error.userInfo["FIRAuthErrorUserInfoNameKey"] as? String)
                        ?? (error.userInfo[NSLocalizedFailureReasonErrorKey] as? String)
                        ?? "code \(error.code)"
                    DispatchQueue.main.async {
                        self.signInError = "\(error.localizedDescription) [\(detail)]"
                    }
                } else {
                    print("[Auth] Firebase signIn succeeded")
                }
            }
        }
    }

    func signOut() {
        GIDSignIn.sharedInstance.signOut()
        try? Auth.auth().signOut()
    }
}

// MARK: - Shared Button / Field Styles

struct CustomTextFieldStyle: TextFieldStyle {
    func _body(configuration: TextField<Self._Label>) -> some View {
        configuration
            .padding()
            .background(Color.iffSurface)
            .cornerRadius(10)
            .foregroundColor(.white)
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.iffAccent, lineWidth: 1))
    }
}

struct CustomButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .padding()
            .background(Color.iffAccent)
            .foregroundColor(.white)
            .clipShape(Capsule())
            .scaleEffect(configuration.isPressed ? 0.95 : 1.0)
    }
}

// MARK: - AppDelegate

class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate, MessagingDelegate {

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        FirebaseApp.configure()
        UNUserNotificationCenter.current().delegate = self
        Messaging.messaging().delegate = self
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            if granted { DispatchQueue.main.async { application.registerForRemoteNotifications() } }
        }
        return true
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return GIDSignIn.sharedInstance.handle(url)
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Messaging.messaging().apnsToken = deviceToken
    }

    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let token = fcmToken, let uid = Auth.auth().currentUser?.uid else { return }
        Firestore.firestore().collection("users").document(uid).setData(["fcmToken": token], merge: true)
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                 withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound])
    }
}

// MARK: - Login View

struct LoginView: View {
    @ObservedObject var authService: AuthenticationService

    var body: some View {
        ZStack {
            LinearGradient(colors: [Color.iffBg, Color.iffSurface], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()

            VStack(spacing: 40) {
                Spacer()

                VStack(spacing: 8) {
                    Text("IFFL")
                        .font(.system(size: 72, weight: .black, design: .rounded))
                        .foregroundColor(Color.iffAccent)
                    Text("Insanity Fantasy Football League")
                        .font(.subheadline)
                        .foregroundColor(Color.iffSubtext)
                    Text("EST. 2008")
                        .font(.caption2.weight(.semibold))
                        .foregroundColor(Color.iffSubtext.opacity(0.6))
                        .tracking(3)
                }

                Spacer()

                VStack(spacing: 12) {
                    Button(action: { authService.signInWithGoogle() }) {
                        HStack(spacing: 12) {
                            Image(systemName: "g.circle.fill")
                                .font(.title2)
                            Text("Sign in with Google")
                                .font(.headline)
                        }
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color(red: 0.26, green: 0.52, blue: 0.96))
                        .cornerRadius(12)
                    }
                    .padding(.horizontal)

                    if let error = authService.signInError {
                        Text(error)
                            .foregroundColor(.red)
                            .font(.caption)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal)
                    }
                }

                Text("Access is limited to IFFL members.")
                    .font(.caption)
                    .foregroundColor(Color.iffSubtext)
                    .padding(.bottom, 30)
            }
        }
    }
}

// MARK: - Shared UI Components

struct CardView<Content: View>: View {
    let content: Content
    init(@ViewBuilder content: () -> Content) { self.content = content() }
    var body: some View {
        content.padding().background(Color.iffSurface).cornerRadius(12).shadow(radius: 4)
    }
}

struct TeamIconView: View {
    let team: FantasyTeam
    var body: some View {
        VStack(spacing: 6) {
            Image(team.name).resizable().scaledToFit().frame(width: 60, height: 60)
            Text(team.name).font(.caption).foregroundColor(.white).lineLimit(1)
        }
        .frame(maxWidth: .infinity).padding(10).iffCard()
    }
}

struct AssetRow: View {
    let item: DisplayAsset
    let activeSeason: Int
    var compact: Bool = false

    private var scale: CGFloat { compact ? 0.85 : 1.0 }

    var body: some View {
        HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 3) {
                Text("  \(item.name)")
                    .font(.system(size: 17 * scale, weight: .semibold))
                    .foregroundColor(.white)
                Text("  \(item.isPick ? "Round \(item.rookieRound ?? 0) · \(item.teamName)" : "\(item.position) · \(item.teamName)")")
                    .font(.system(size: 13 * scale))
                    .foregroundColor(Color.iffSubtext)
            }
            Spacer()
            Text(item.formattedCurrentPrice)
                .font(.system(size: 17 * scale, weight: .bold))
                .foregroundColor(Color.iffGold)
        }
        .padding(.vertical, 12)
    }
}

struct FilterSection: View {
    @Binding var selectedTeams: Set<String>
    @Binding var selectedPositions: Set<String>
    @Binding var sortOption: String
    let allTeams: [String]
    let allPositions: [String]
    let sortOptions: [String]

    var body: some View {
        VStack(spacing: 12) {
            chipRow(label: "Teams", items: allTeams, selection: $selectedTeams)
            chipRow(label: "Positions", items: allPositions, selection: $selectedPositions)
            VStack(alignment: .leading) {
                Text("Sort").font(.headline).foregroundColor(.white)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
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
            Text(label).font(.headline).foregroundColor(.white)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
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

struct ChipView: View {
    let text: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Text(text)
            .font(.caption.bold())
            .padding(.horizontal, 10).padding(.vertical, 6)
            .background(isSelected ? Color.iffAccent : Color.iffSurface)
            .foregroundColor(isSelected ? .white : Color.iffSubtext)
            .clipShape(Capsule())
            .onTapGesture(perform: action)
    }
}

// MARK: - Asset Detail View

struct AssetDetailView: View {
    @EnvironmentObject var appState: AppState
    let asset: DisplayAsset

    private var interestedCount: Int {
        appState.allLeagueInterests.filter { $0.assetId == asset.assetId }.count
    }

    var body: some View {
        ZStack {
            Color.iffBg.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text(asset.name)
                        .font(.title.bold()).foregroundColor(.white)
                    Text(asset.isPick
                         ? "Draft Pick · \(asset.teamName)"
                         : "\(asset.position) · \(asset.teamName)")
                        .font(.subheadline).foregroundColor(Color.iffSubtext)

                    if interestedCount > 0 {
                        HStack(spacing: 6) {
                            Image(systemName: "eye.fill").font(.caption).foregroundColor(Color.iffAccent)
                            Text("\(interestedCount) team\(interestedCount == 1 ? "" : "s") interested")
                                .font(.caption).foregroundColor(Color.iffAccent)
                        }
                    }

                    Divider().background(Color.iffSubtext)

                    Group {
                        priceRow(label: "\(appState.activeSeason) Price",
                                 value: "$\(asset.price(forSeason: appState.activeSeason))",
                                 color: Color.iffGold)
                        priceRow(label: "\(appState.activeSeason + 1) Price",
                                 value: "$\(asset.price(forSeason: appState.activeSeason + 1))")
                        priceRow(label: "\(appState.activeSeason + 2) Price",
                                 value: "$\(asset.price(forSeason: appState.activeSeason + 2))")
                        if !asset.isPick {
                            priceRow(label: "Original Price", value: "$\(asset.originalPrice)")
                        }
                    }

                    Divider().background(Color.iffSubtext)

                    if !asset.isPick {
                        Group {
                            infoRow(label: "Purchase Year",       value: asset.formattedPurchaseYear)
                            infoRow(label: "Contract Years Left", value: "\(asset.contractYearsRemaining)")
                            infoRow(label: "Player Pool",         value: asset.playerPool)
                            if let rr = asset.rookieRound, let ry = asset.rookieDraftYear {
                                infoRow(label: "Rookie Draft", value: "\(ry) Round \(rr)")
                            }
                        }
                    } else {
                        infoRow(label: "Draft Season", value: "\(asset.rookieDraftYear ?? 0)")
                        infoRow(label: "Round",        value: "\(asset.rookieRound ?? 0)")
                    }

                    if !asset.tradeHistory.isEmpty {
                        Divider().background(Color.iffSubtext)
                        Text("Trade History").font(.headline).foregroundColor(.white)
                        ForEach(Array(asset.tradeHistory.enumerated()), id: \.offset) { _, note in
                            Text("• \(note)").font(.body).foregroundColor(.white)
                        }
                    }

                    if asset.teamName != appState.userTeam {
                        Divider().background(Color.iffSubtext)
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
        .onAppear { appState.loadAllLeagueInterests() }
    }

    private func priceRow(label: String, value: String, color: Color = .white) -> some View {
        HStack {
            Text(label).foregroundColor(Color.iffSubtext)
            Spacer()
            Text(value).bold().foregroundColor(color)
        }
    }

    private func infoRow(label: String, value: String) -> some View {
        HStack {
            Text(label).foregroundColor(Color.iffSubtext)
            Spacer()
            Text(value).foregroundColor(.white)
        }
    }
}

// MARK: - Trade History Views (shared by MarketView + HistoricalTradesView)

struct TradeRowView: View {
    let trade: Trade
    var body: some View {
        HStack {
            Text("\(trade.formattedDate) · \(trade.proposingTeamName) & \(trade.receivingTeamName)")
                .font(.body).foregroundColor(.white)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, 5)
    }
}

struct TradeDetailView: View {
    let trade: Trade

    var body: some View {
        ZStack {
            Color.iffBg.ignoresSafeArea()
            VStack(alignment: .leading, spacing: 12) {
                Text("\(trade.proposingTeamName) ↔ \(trade.receivingTeamName)")
                    .font(.title2.bold()).foregroundColor(.white)
                Text(trade.formattedDate).font(.subheadline).foregroundColor(Color.iffSubtext)

                Divider().background(Color.iffSubtext)

                HStack(alignment: .top, spacing: 24) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("\(trade.receivingTeamName) Gets:")
                            .font(.headline).foregroundColor(.white)
                        ForEach(trade.proposerAssetNames, id: \.self) {
                            Text("• \($0)").foregroundColor(.white)
                        }
                    }
                    VStack(alignment: .leading, spacing: 6) {
                        Text("\(trade.proposingTeamName) Gets:")
                            .font(.headline).foregroundColor(.white)
                        ForEach(trade.receiverAssetNames, id: \.self) {
                            Text("• \($0)").foregroundColor(.white)
                        }
                    }
                }

                if let notes = trade.notes, !notes.isEmpty {
                    Divider().background(Color.iffSubtext)
                    Text("Notes: \(notes)").foregroundColor(Color.iffSubtext)
                }

                Spacer()
            }
            .padding()
        }
        .navigationTitle("Trade Details")
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct HistoricalTradesView: View {
    @EnvironmentObject var appState: AppState

    private var seasons: [Int] {
        Array(Set(appState.trades.map { $0.season }).sorted(by: >))
    }

    var body: some View {
        ZStack {
            Color.iffBg.ignoresSafeArea()
            List {
                ForEach(seasons, id: \.self) { season in
                    let trades = appState.trades.filter {
                        $0.season == season && ($0.status == .completed || $0.status == .historical)
                    }
                    if !trades.isEmpty {
                        NavigationLink(destination: SeasonTradesView(season: season, trades: trades)) {
                            Text(String(season)).foregroundColor(.white)
                        }
                        .listRowBackground(Color.iffSurface)
                    }
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
        }
        .navigationTitle("Historical Trades")
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct SeasonTradesView: View {
    let season: Int
    let trades: [Trade]

    var body: some View {
        ZStack {
            Color.iffBg.ignoresSafeArea()
            List {
                ForEach(trades.sorted { $0.date > $1.date }) { trade in
                    NavigationLink(destination: TradeDetailView(trade: trade)) {
                        TradeRowView(trade: trade)
                    }
                    .listRowBackground(Color.iffSurface)
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
        }
        .navigationTitle("\(season) Trades")
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Trade Proposal View

struct TradeProposalView: View {
    @EnvironmentObject var appState: AppState
    @State private var selectedOtherTeam: String? = nil
    @State private var selectedOfferedIds: Set<String>   = []
    @State private var selectedRequestedIds: Set<String> = []
    @State private var showSuccess = false
    @State private var errorMsg = ""

    var body: some View {
        ZStack {
            Color.iffBg.ignoresSafeArea()

            VStack(spacing: 20) {
                Picker("Select other team", selection: $selectedOtherTeam) {
                    Text("Select a team").tag(nil as String?)
                    ForEach(fantasyTeams.map { $0.name }.filter { $0 != appState.userTeam }, id: \.self) {
                        Text($0).tag($0 as String?)
                    }
                }
                .pickerStyle(.menu)
                .foregroundColor(.white)

                if let otherTeam = selectedOtherTeam {
                    let myAssets    = appState.allDisplayAssets.filter { $0.teamName == appState.userTeam }
                    let theirAssets = appState.allDisplayAssets.filter { $0.teamName == otherTeam }

                    ScrollView {
                        VStack(alignment: .leading, spacing: 16) {
                            assetPicker(title: "You Give", assets: myAssets, selectedIds: $selectedOfferedIds)
                            assetPicker(title: "You Want (\(otherTeam))", assets: theirAssets, selectedIds: $selectedRequestedIds)
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
                    .buttonStyle(IFFLPrimaryButtonStyle())

                Spacer()
            }
            .padding()
        }
        .navigationTitle("Propose Trade")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { handleShortcut() }
    }

    @ViewBuilder
    private func assetPicker(title: String, assets: [DisplayAsset], selectedIds: Binding<Set<String>>) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.headline).foregroundColor(.white)
            ForEach(assets.sorted { $0.currentPrice > $1.currentPrice }) { asset in
                HStack {
                    VStack(alignment: .leading) {
                        Text(asset.name).foregroundColor(.white).font(.subheadline)
                        Text(asset.isPick ? "Pick" : asset.position)
                            .foregroundColor(Color.iffSubtext).font(.caption)
                    }
                    Spacer()
                    Text(asset.formattedCurrentPrice).foregroundColor(Color.iffGold).font(.subheadline)
                    if selectedIds.wrappedValue.contains(asset.id) {
                        Image(systemName: "checkmark.circle.fill").foregroundColor(Color.iffAccent)
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
                Divider().background(Color.iffSubtext.opacity(0.3))
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
        let trade = Trade(id: nil, season: appState.activeSeason, date: Date(),
                          status: .proposed, proposingTeamName: appState.userTeam,
                          receivingTeamName: otherTeam, assetsFromProposer: offeredRefs,
                          assetsFromReceiver: requestedRefs, notes: nil, completedAt: nil,
                          response: nil, isHistorical: false,
                          historicalProposerAssets: nil, historicalReceiverAssets: nil)
        appState.dataService.proposeTrade(trade) { error in
            DispatchQueue.main.async {
                if let e = error {
                    self.errorMsg = e.localizedDescription
                } else {
                    self.showSuccess = true
                    self.selectedOfferedIds.removeAll()
                    self.selectedRequestedIds.removeAll()
                    self.selectedOtherTeam = nil
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2) { self.showSuccess = false }
                }
            }
        }
    }
}
