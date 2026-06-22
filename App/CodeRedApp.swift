import SwiftUI
import Firebase
import FirebaseMessaging
import FirebaseAuth
import FirebaseFirestore
import GoogleSignIn
import AuthenticationServices
import CryptoKit

// MARK: - Legal / Privacy

enum BeltLegal {
    /// Public privacy policy URL. Must match the Privacy Policy URL set in
    /// App Store Connect → App Information. Required by App Store guideline 5.1.2.
    /// Replace with the live hosted URL (Google Doc "Publish to web" or website).
    static let privacyPolicyURL = URL(string: "https://iffl-auth.web.app/privacy.html")!
}

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
    @Published var tradePreset: TradePreset? = nil

    @Published var fmkSignals: [PlayerFMK] = []
    @Published var allLeagueFMK: [PlayerFMK] = []
    @Published var userSettings: UserSettings = UserSettings()
    @Published var didLoadSettings: Bool = false
    @Published var leagueHistory: [SeasonHistory] = []
    @Published var isOffSeason: Bool = false

    let dataService = FirestoreDataService()

    private var playerListener:  ListenerRegistration?
    private var pickListener:    ListenerRegistration?
    private var tradeListener:   ListenerRegistration?
    private var messageListener: ListenerRegistration?
    private var fmkListener:     ListenerRegistration?

    var currentUserUID: String? { Auth.auth().currentUser?.uid }

    var isAdmin: Bool {
        Auth.auth().currentUser?.email?.lowercased() == "jaredrogtaylor@gmail.com"
    }

    var allDisplayAssets: [DisplayAsset] {
        let playerAssets = players.map { $0.toDisplayAsset(activeSeason: activeSeason) }
        let pickAssets   = draftPicks.map { $0.toDisplayAsset(activeSeason: activeSeason) }
        return playerAssets + pickAssets
    }

    var myMatchCount: Int {
        MarketEngine.findMatches(fmkSignals: allLeagueFMK, assets: allDisplayAssets)
            .filter { $0.teamA == userTeam || $0.teamB == userTeam }.count
    }

    // MARK: Setup / Teardown

    func setup(for user: User) {
        dataService.fetchLeagueConfig { [weak self] config in
            guard let self else { return }
            DispatchQueue.main.async {
                self.activeSeason   = config?.activeSeasonYear ?? 2026
                self.isCommissioner = config?.authorizedUIDs.contains(user.uid) ?? false
                self.isOffSeason    = config?.isOffSeason ?? false

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
        loadFMKSignals(userId: user.uid)
        loadUserSettings(userId: user.uid)
    }

    func teardown() {
        playerListener?.remove();  playerListener  = nil
        pickListener?.remove();    pickListener    = nil
        tradeListener?.remove();   tradeListener   = nil
        messageListener?.remove(); messageListener = nil
        fmkListener?.remove();     fmkListener     = nil
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

        fmkListener = dataService.listenToAllFMKSignals { [weak self] signals, _ in
            guard let self else { return }
            DispatchQueue.main.async { self.allLeagueFMK = signals }
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
            completion(NSError(domain: "TheBelt", code: -1))
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

    // MARK: - FMK

    private func loadFMKSignals(userId: String) {
        dataService.getFMKSignals(for: userId) { [weak self] signals, _ in
            guard let self, let signals else { return }
            DispatchQueue.main.async { self.fmkSignals = signals }
        }
    }

    func setFMKSignal(for asset: DisplayAsset, signal: FMKSignal, completion: @escaping (Error?) -> Void) {
        guard let uid = currentUserUID else { completion(NSError(domain: "TheBelt", code: -1)); return }
        let existing = fmkSignals.first(where: { $0.assetId == asset.assetId })
        let fmk = PlayerFMK(
            id: nil, userId: uid, teamName: userTeam,
            assetId: asset.assetId, assetName: asset.name,
            assetOwnerTeam: asset.teamName, signal: signal,
            timestamp: existing?.timestamp ?? Date(),
            updatedAt: Date()
        )
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        dataService.setFMKSignal(fmk) { [weak self] error in
            if error == nil {
                DispatchQueue.main.async {
                    self?.fmkSignals.removeAll { $0.assetId == fmk.assetId }
                    self?.fmkSignals.append(fmk)
                }
            }
            completion(error)
        }
    }

    func removeFMKSignal(for asset: DisplayAsset, completion: @escaping (Error?) -> Void) {
        guard let uid = currentUserUID else { completion(NSError(domain: "TheBelt", code: -1)); return }
        dataService.removeFMKSignal(userId: uid, assetId: asset.assetId) { [weak self] error in
            if error == nil {
                DispatchQueue.main.async { self?.fmkSignals.removeAll { $0.assetId == asset.assetId } }
            }
            completion(error)
        }
    }

    func currentFMKSignal(for asset: DisplayAsset) -> FMKSignal? {
        fmkSignals.first(where: { $0.assetId == asset.assetId })?.signal
    }

    // MARK: - User Settings

    private func loadUserSettings(userId: String) {
        dataService.fetchUserSettings(userId: userId) { [weak self] settings in
            guard let self else { return }
            DispatchQueue.main.async {
                self.userSettings = settings ?? UserSettings()
                self.didLoadSettings = true
            }
        }
    }

    func saveUserSettings(completion: @escaping (Error?) -> Void) {
        guard let uid = currentUserUID else { completion(NSError(domain: "TheBelt", code: -1)); return }
        dataService.saveUserSettings(userSettings, userId: uid, completion: completion)
    }

    // MARK: - League History

    func loadLeagueHistory() {
        dataService.fetchLeagueHistory { [weak self] history, _ in
            guard let self, let history else { return }
            DispatchQueue.main.async { self.leagueHistory = history }
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
                DispatchQueue.main.async { self.signInError = error.localizedDescription }
                return
            }
            guard let user = result?.user,
                  let idToken = user.idToken?.tokenString else { return }
            let credential = GoogleAuthProvider.credential(
                withIDToken: idToken,
                accessToken: user.accessToken.tokenString
            )
            Auth.auth().signIn(with: credential) { _, error in
                if let error = error as NSError? {
                    DispatchQueue.main.async { self.signInError = error.localizedDescription }
                }
            }
        }
    }

    func signInWithEmail(_ email: String, password: String) {
        Auth.auth().signIn(withEmail: email, password: password) { [weak self] _, error in
            if let error = error {
                DispatchQueue.main.async { self?.signInError = error.localizedDescription }
            }
        }
    }

    // MARK: - Sign in with Apple

    private var currentNonce: String?

    func prepareAppleRequest(_ request: ASAuthorizationAppleIDRequest) {
        let nonce = randomNonceString()
        currentNonce = nonce
        request.requestedScopes = [.fullName, .email]
        request.nonce = sha256(nonce)
    }

    func handleAppleResult(_ result: Result<ASAuthorization, Error>) {
        switch result {
        case .success(let auth):
            guard let credential = auth.credential as? ASAuthorizationAppleIDCredential,
                  let tokenData  = credential.identityToken,
                  let idToken    = String(data: tokenData, encoding: .utf8),
                  let nonce      = currentNonce else {
                DispatchQueue.main.async { self.signInError = "Sign in with Apple failed." }
                return
            }
            let firebaseCredential = OAuthProvider.appleCredential(
                withIDToken: idToken,
                rawNonce: nonce,
                fullName: credential.fullName
            )
            Auth.auth().signIn(with: firebaseCredential) { _, error in
                if let error = error {
                    DispatchQueue.main.async { self.signInError = error.localizedDescription }
                }
            }
        case .failure(let error):
            let nsError = error as NSError
            if nsError.code == ASAuthorizationError.canceled.rawValue { return }
            DispatchQueue.main.async { self.signInError = error.localizedDescription }
        }
    }

    private func randomNonceString(length: Int = 32) -> String {
        var bytes = [UInt8](repeating: 0, count: length)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        return String(bytes.map { charset[Int($0) % charset.count] })
    }

    private func sha256(_ input: String) -> String {
        SHA256.hash(data: Data(input.utf8))
            .compactMap { String(format: "%02x", $0) }.joined()
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
            .background(Color.beltSurface)
            .cornerRadius(10)
            .foregroundColor(.white)
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.beltAccent, lineWidth: 1))
    }
}

struct CustomButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .padding()
            .background(Color.beltAccent)
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
    @State private var showEmailLogin = true
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        ZStack {
            LinearGradient(colors: [Color.beltBg, Color.beltSurface], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()

            VStack(spacing: 40) {
                Spacer()

                VStack(spacing: 8) {
                    Text("The Belt")
                        .font(.system(size: 72, weight: .black, design: .rounded))
                        .foregroundColor(Color.beltAccent)
                    Text("Fantasy Football League")
                        .font(.subheadline)
                        .foregroundColor(Color.beltSubtext)
                    Text("EST. 2008")
                        .font(.caption2.weight(.semibold))
                        .foregroundColor(Color.beltSubtext.opacity(0.6))
                        .tracking(3)
                }

                Spacer()

                VStack(spacing: 12) {
                    SignInWithAppleButton(.signIn) { request in
                        authService.prepareAppleRequest(request)
                    } onCompletion: { result in
                        authService.handleAppleResult(result)
                    }
                    .signInWithAppleButtonStyle(.white)
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
                    .cornerRadius(12)
                    .padding(.horizontal)

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

                VStack(spacing: 12) {
                    Text("Access is limited to league members.")
                        .font(.caption)
                        .foregroundColor(Color.beltSubtext)

                    VStack(spacing: 2) {
                        Text("By signing in, you agree that your account info and league activity are stored to run the app.")
                            .font(.caption2)
                            .foregroundColor(Color.beltSubtext)
                            .multilineTextAlignment(.center)
                        Link("View our Privacy Policy", destination: BeltLegal.privacyPolicyURL)
                            .font(.caption2.weight(.semibold))
                            .foregroundColor(Color.beltAccent)
                    }
                    .padding(.horizontal, 24)

                    Button(action: { withAnimation(.easeInOut(duration: 0.2)) { showEmailLogin.toggle() } }) {
                        Text(showEmailLogin ? "Hide email sign-in" : "Sign in with Email")
                            .font(.caption)
                            .foregroundColor(Color.beltSubtext.opacity(0.8))
                            .underline()
                    }

                    if showEmailLogin {
                        VStack(spacing: 10) {
                            TextField("Email", text: $email)
                                .keyboardType(.emailAddress)
                                .autocapitalization(.none)
                                .textContentType(.username)
                                .padding(12)
                                .background(Color.beltSurface)
                                .cornerRadius(10)
                                .foregroundColor(.white)
                                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.beltElevated, lineWidth: 1))

                            SecureField("Password", text: $password)
                                .textContentType(.password)
                                .padding(12)
                                .background(Color.beltSurface)
                                .cornerRadius(10)
                                .foregroundColor(.white)
                                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.beltElevated, lineWidth: 1))

                            Button(action: { authService.signInWithEmail(email, password: password) }) {
                                Text("Sign In")
                                    .font(.headline)
                                    .foregroundColor(.white)
                                    .frame(maxWidth: .infinity)
                                    .padding(12)
                                    .background(Color.beltAccent)
                                    .cornerRadius(10)
                            }
                        }
                        .padding(.horizontal)
                        .transition(.opacity.combined(with: .move(edge: .top)))
                    }
                }
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
        content.padding().background(Color.beltSurface).cornerRadius(12).shadow(radius: 4)
    }
}

struct TeamIconView: View {
    let team: FantasyTeam
    var body: some View {
        VStack(spacing: 6) {
            Image(team.name).resizable().scaledToFit().frame(width: 60, height: 60)
            Text(team.name).font(.caption).foregroundColor(.white).lineLimit(1)
            HStack(spacing: 2) {
                ForEach(0..<team.beltWins, id: \.self) { _ in
                    Image(systemName: "trophy.fill")
                        .font(.system(size: 9))
                        .foregroundColor(Color.beltGold)
                }
            }
            .frame(height: 12)
        }
        .frame(maxWidth: .infinity).padding(10).beltCard()
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
                Text("  \(item.isPick ? "Round \(item.rookieRound ?? 0) · \(item.teamName)" : item.position)")
                    .font(.system(size: 13 * scale))
                    .foregroundColor(Color.beltSubtext)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text("$\(item.price(forSeason: activeSeason))")
                    .font(.system(size: 16 * scale, weight: .bold))
                    .foregroundColor(.green)
                Text("$\(item.price(forSeason: activeSeason + 1))")
                    .font(.system(size: 12 * scale, weight: .semibold))
                    .foregroundColor(Color.beltGold)
            }
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
            .background(isSelected ? Color.beltAccent : Color.beltSurface)
            .foregroundColor(isSelected ? .white : Color.beltSubtext)
            .clipShape(Capsule())
            .onTapGesture(perform: action)
    }
}

// MARK: - FMK Signal Picker

struct FMKSignalPicker: View {
    @EnvironmentObject var appState: AppState
    let asset: DisplayAsset

    private let signals: [FMKSignal] = [.kill, .fuck, .marry]

    var body: some View {
        HStack(spacing: 8) {
            Text("Your Signal:")
                .font(.caption).foregroundColor(Color.beltSubtext)
            ForEach(signals, id: \.self) { signal in
                let isCurrent = appState.currentFMKSignal(for: asset) == signal
                Button {
                    if isCurrent {
                        appState.removeFMKSignal(for: asset) { _ in }
                    } else {
                        appState.setFMKSignal(for: asset, signal: signal) { _ in }
                    }
                } label: {
                    Text("\(signal.emoji) \(signal.label)")
                        .font(.caption.bold())
                        .foregroundColor(isCurrent ? .white : Color.beltSubtext)
                        .padding(.horizontal, 10).padding(.vertical, 5)
                        .background(isCurrent ? signal.signalColor.opacity(0.8) : Color.beltElevated)
                        .clipShape(Capsule())
                }
            }
        }
    }
}

// MARK: - Asset Detail View

struct AssetDetailView: View {
    @EnvironmentObject var appState: AppState
    let asset: DisplayAsset

    private var fmkSummary: (marry: Int, fuck: Int, kill: Int) {
        let relevant = appState.allLeagueFMK.filter { $0.assetId == asset.assetId }
        return (
            marry: relevant.filter { $0.signal == .marry }.count,
            fuck:  relevant.filter { $0.signal == .fuck  }.count,
            kill:  relevant.filter { $0.signal == .kill  }.count
        )
    }

    var body: some View {
        ZStack {
            Color.beltBg.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text(asset.name)
                        .font(.title.bold()).foregroundColor(.white)
                    Text(asset.isPick
                         ? "Draft Pick · \(asset.teamName)"
                         : "\(asset.position) · \(asset.teamName.isEmpty ? "Free Agent" : asset.teamName)")
                        .font(.subheadline).foregroundColor(Color.beltSubtext)

                    let summary = fmkSummary
                    if summary.marry + summary.fuck + summary.kill > 0 {
                        HStack(spacing: 12) {
                            if summary.marry > 0 { Text("💍 \(summary.marry)").font(.subheadline).foregroundColor(.white) }
                            if summary.fuck  > 0 { Text("🔥 \(summary.fuck)").font(.subheadline).foregroundColor(.white) }
                            if summary.kill  > 0 { Text("💀 \(summary.kill)").font(.subheadline).foregroundColor(.white) }
                        }
                    }

                    FMKSignalPicker(asset: asset)

                    Divider().background(Color.beltSubtext)

                    Group {
                        priceRow(label: "\(appState.activeSeason) Price",
                                 value: "$\(asset.price(forSeason: appState.activeSeason))",
                                 color: Color.beltGold)
                        priceRow(label: "\(appState.activeSeason + 1) Price",
                                 value: "$\(asset.price(forSeason: appState.activeSeason + 1))")
                        priceRow(label: "\(appState.activeSeason + 2) Price",
                                 value: "$\(asset.price(forSeason: appState.activeSeason + 2))")
                        if !asset.isPick {
                            priceRow(label: "Original Price", value: "$\(asset.originalPrice)")
                        }
                    }

                    Divider().background(Color.beltSubtext)

                    if !asset.isPick {
                        Group {
                            if let nflTeam = asset.nflTeam {
                                infoRow(label: "NFL Team", value: nflTeam)
                            }
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
                        Divider().background(Color.beltSubtext)
                        Text("Trade History").font(.headline).foregroundColor(.white)
                        ForEach(Array(asset.tradeHistory.enumerated()), id: \.offset) { _, note in
                            Text("• \(note)").font(.body).foregroundColor(.white)
                        }
                    }

                    if asset.teamName != appState.userTeam {
                        Divider().background(Color.beltSubtext)
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
            Text(label).foregroundColor(Color.beltSubtext)
            Spacer()
            Text(value).bold().foregroundColor(color)
        }
    }

    private func infoRow(label: String, value: String) -> some View {
        HStack {
            Text(label).foregroundColor(Color.beltSubtext)
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
    @EnvironmentObject var appState: AppState
    @State private var showCounter = false
    @State private var actionError = ""

    private var isIncomingProposal: Bool {
        trade.receivingTeamName == appState.userTeam && trade.status == .proposed
    }

    private var chainHistory: [Trade] {
        var history: [Trade] = []
        var currentId = trade.parentTradeId
        while let pid = currentId {
            if let parent = appState.trades.first(where: { $0.id == pid }) {
                history.append(parent)
                currentId = parent.parentTradeId
            } else { break }
        }
        return history.reversed()
    }

    var body: some View {
        ZStack {
            Color.beltBg.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("\(trade.proposingTeamName) ↔ \(trade.receivingTeamName)")
                        .font(.title2.bold()).foregroundColor(.white)
                    Text(trade.formattedDate).font(.subheadline).foregroundColor(Color.beltSubtext)

                    Divider().background(Color.beltSubtext)

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

                    if let msg = trade.message, !msg.isEmpty {
                        Divider().background(Color.beltSubtext)
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Note from \(trade.proposingTeamName)")
                                .font(.caption).foregroundColor(Color.beltSubtext)
                            Text(msg).foregroundColor(.white).font(.subheadline)
                        }
                    }

                    if !chainHistory.isEmpty {
                        Divider().background(Color.beltSubtext)
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Negotiation History")
                                .font(.caption.bold()).foregroundColor(Color.beltSubtext)
                            ForEach(Array(chainHistory.enumerated()), id: \.offset) { idx, prior in
                                HStack(spacing: 6) {
                                    Text("Round \(idx + 1):")
                                        .font(.caption).foregroundColor(Color.beltSubtext)
                                    Text("\(prior.proposingTeamName) offered \(prior.proposerAssetNames.prefix(2).joined(separator: ", "))")
                                        .font(.caption).foregroundColor(Color.beltSubtext.opacity(0.8))
                                        .lineLimit(1)
                                }
                            }
                        }
                    }

                    if !actionError.isEmpty {
                        Text(actionError).foregroundColor(.red).font(.caption)
                    }

                    if isIncomingProposal {
                        Divider().background(Color.beltSubtext)
                        HStack(spacing: 12) {
                            Button("Accept") {
                                guard let id = trade.id else { return }
                                appState.dataService.respondToTrade(tradeId: id, response: .yes) { err in
                                    DispatchQueue.main.async {
                                        actionError = err?.localizedDescription ?? ""
                                    }
                                }
                            }
                            .font(.headline).foregroundColor(.white)
                            .frame(maxWidth: .infinity).padding(12)
                            .background(Color.green.opacity(0.8)).cornerRadius(10)

                            Button("Decline") {
                                guard let id = trade.id else { return }
                                appState.dataService.respondToTrade(tradeId: id, response: .no) { err in
                                    DispatchQueue.main.async {
                                        actionError = err?.localizedDescription ?? ""
                                    }
                                }
                            }
                            .font(.headline).foregroundColor(.white)
                            .frame(maxWidth: .infinity).padding(12)
                            .background(Color.red.opacity(0.7)).cornerRadius(10)

                            Button("Counter") { showCounter = true }
                                .font(.headline).foregroundColor(.white)
                                .frame(maxWidth: .infinity).padding(12)
                                .background(Color.beltGold.opacity(0.8)).cornerRadius(10)
                        }
                    }

                    Spacer()
                }
                .padding()
            }
        }
        .navigationTitle("Trade Details")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showCounter) {
            CounterOfferView(originalTrade: trade).environmentObject(appState)
        }
    }
}

// MARK: - Counter Offer View

struct CounterOfferView: View {
    let originalTrade: Trade
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) private var dismiss

    @State private var selectedOfferedIds: Set<String>   = []
    @State private var selectedRequestedIds: Set<String> = []
    @State private var counterMessage = ""
    @State private var showSuccess = false
    @State private var errorMsg = ""

    private var otherTeam: String { originalTrade.proposingTeamName }

    var body: some View {
        NavigationStack {
            ZStack {
                Color.beltBg.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Original Offer from \(otherTeam)")
                                .font(.caption.bold()).foregroundColor(Color.beltSubtext)
                            Text("\(otherTeam) gives: \(originalTrade.proposerAssetNames.joined(separator: ", "))")
                                .font(.caption).foregroundColor(Color.beltSubtext.opacity(0.8))
                            Text("You give: \(originalTrade.receiverAssetNames.joined(separator: ", "))")
                                .font(.caption).foregroundColor(Color.beltSubtext.opacity(0.8))
                        }
                        .padding()
                        .background(Color.beltElevated)
                        .cornerRadius(10)

                        let myAssets    = appState.allDisplayAssets.filter { $0.teamName == appState.userTeam }
                        let theirAssets = appState.allDisplayAssets.filter { $0.teamName == otherTeam }

                        assetPicker(title: "You Give", assets: myAssets, selectedIds: $selectedOfferedIds)
                        assetPicker(title: "You Want (\(otherTeam))", assets: theirAssets, selectedIds: $selectedRequestedIds)

                        TextField("Add a note (optional)", text: $counterMessage, axis: .vertical)
                            .lineLimit(3)
                            .padding(12)
                            .background(Color.beltSurface)
                            .cornerRadius(10)
                            .foregroundColor(.white)

                        if showSuccess {
                            Text("✓ Counter sent!").foregroundColor(.green).font(.subheadline)
                        }
                        if !errorMsg.isEmpty {
                            Text(errorMsg).foregroundColor(.red).font(.caption)
                        }

                        Button("Send Counter") { submitCounter() }
                            .disabled(selectedOfferedIds.isEmpty || selectedRequestedIds.isEmpty)
                            .buttonStyle(BeltPrimaryButtonStyle())
                            .frame(maxWidth: .infinity)
                    }
                    .padding()
                }
            }
            .navigationTitle("Counter Offer")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") { dismiss() }
                        .foregroundColor(Color.beltSubtext)
                }
            }
        }
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
                            .foregroundColor(Color.beltSubtext).font(.caption)
                    }
                    Spacer()
                    Text(asset.formattedCurrentPrice).foregroundColor(Color.beltGold).font(.subheadline)
                    if selectedIds.wrappedValue.contains(asset.id) {
                        Image(systemName: "checkmark.circle.fill").foregroundColor(Color.beltAccent)
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
                Divider().background(Color.beltSubtext.opacity(0.3))
            }
        }
    }

    private func submitCounter() {
        guard let originalId = originalTrade.id else { return }
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
        let counter = Trade(
            id: nil, season: appState.activeSeason, date: Date(),
            status: .proposed,
            proposingTeamName: appState.userTeam,
            receivingTeamName: otherTeam,
            assetsFromProposer: offeredRefs,
            assetsFromReceiver: requestedRefs,
            notes: nil,
            message: counterMessage.isEmpty ? nil : counterMessage,
            parentTradeId: originalId,
            completedAt: nil, response: nil, isHistorical: false,
            historicalProposerAssets: nil, historicalReceiverAssets: nil
        )
        appState.dataService.counterOffer(originalTradeId: originalId, counter: counter) { error in
            DispatchQueue.main.async {
                if let e = error {
                    errorMsg = e.localizedDescription
                } else {
                    showSuccess = true
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { dismiss() }
                }
            }
        }
    }
}

struct HistoricalTradesView: View {
    @EnvironmentObject var appState: AppState

    private var seasons: [Int] {
        Array(Set(appState.trades.map { $0.season }).sorted(by: >))
    }

    var body: some View {
        ZStack {
            Color.beltBg.ignoresSafeArea()
            List {
                ForEach(seasons, id: \.self) { season in
                    let trades = appState.trades.filter {
                        $0.season == season && ($0.status == .completed || $0.status == .historical)
                    }
                    if !trades.isEmpty {
                        NavigationLink(destination: SeasonTradesView(season: season, trades: trades)) {
                            Text(String(season)).foregroundColor(.white)
                        }
                        .listRowBackground(Color.beltSurface)
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
            Color.beltBg.ignoresSafeArea()
            List {
                ForEach(trades.sorted { $0.date > $1.date }) { trade in
                    NavigationLink(destination: TradeDetailView(trade: trade)) {
                        TradeRowView(trade: trade)
                    }
                    .listRowBackground(Color.beltSurface)
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
    @State private var proposalMessage = ""
    @State private var showSuccess = false
    @State private var errorMsg = ""

    var body: some View {
        ZStack {
            Color.beltBg.ignoresSafeArea()

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

                TextField("Add a note (optional)", text: $proposalMessage, axis: .vertical)
                    .lineLimit(3)
                    .padding(12)
                    .background(Color.beltSurface)
                    .cornerRadius(10)
                    .foregroundColor(.white)
                    .padding(.horizontal)

                Button("Propose Trade") { submitProposal() }
                    .disabled(selectedOtherTeam == nil || selectedOfferedIds.isEmpty || selectedRequestedIds.isEmpty)
                    .buttonStyle(BeltPrimaryButtonStyle())

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
                            .foregroundColor(Color.beltSubtext).font(.caption)
                    }
                    Spacer()
                    Text(asset.formattedCurrentPrice).foregroundColor(Color.beltGold).font(.subheadline)
                    if selectedIds.wrappedValue.contains(asset.id) {
                        Image(systemName: "checkmark.circle.fill").foregroundColor(Color.beltAccent)
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
                Divider().background(Color.beltSubtext.opacity(0.3))
            }
        }
    }

    private func handleShortcut() {
        if let preset = appState.tradePreset {
            selectedOtherTeam     = preset.otherTeam
            selectedOfferedIds    = preset.offeredIds
            selectedRequestedIds  = preset.requestedIds
            appState.tradePreset  = nil
            return
        }
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
                          assetsFromReceiver: requestedRefs, notes: nil,
                          message: proposalMessage.isEmpty ? nil : proposalMessage,
                          completedAt: nil, response: nil, isHistorical: false,
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
                    self.proposalMessage = ""
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2) { self.showSuccess = false }
                }
            }
        }
    }
}
