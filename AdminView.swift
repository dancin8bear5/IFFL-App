import SwiftUI
import FirebaseAuth

// MARK: - AdminView
// Commissioner-only panel. Gated by LeagueConfig.authorizedUIDs.
// Access point: tab visible only when appState.isCommissioner == true.

struct AdminView: View {
    @EnvironmentObject var appState: AppState
    @State private var selectedSection: AdminSection = .database

    enum AdminSection: String, CaseIterable {
        case database  = "Database"
        case players   = "Players"
        case picks     = "Picks"
        case trades    = "Trades"
        case messages  = "Messages"
        case access    = "Access"
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
                    // Section picker
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(AdminSection.allCases, id: \.self) { section in
                                ChipView(text: section.rawValue, isSelected: selectedSection == section) {
                                    selectedSection = section
                                }
                            }
                        }
                        .padding(.horizontal)
                        .padding(.vertical, 8)
                    }

                    Divider().background(Color("SecondaryTextColor"))

                    switch selectedSection {
                    case .database:  AdminDatabaseSection()
                    case .players:   AdminPlayersSection()
                    case .picks:     AdminPicksSection()
                    case .trades:    AdminTradesSection()
                    case .messages:  AdminMessagesSection()
                    case .access:    AdminAccessSection()
                    }
                }
            }
            .navigationTitle("Commissioner")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Text("Commissioner Panel")
                        .foregroundColor(Color("AccentColor"))
                        .fontWeight(.bold)
                }
            }
        }
    }
}

// MARK: - Database Section

struct AdminDatabaseSection: View {
    @EnvironmentObject var appState: AppState
    @State private var seedStatus: String = ""
    @State private var isSeeding: Bool = false
    @State private var showSeedConfirm: Bool = false

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                AdminCard(title: "Seed Database", icon: "server.rack") {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Imports all 2026 player and draft pick data from the hardcoded 2026 IFFL Keeper Master List into Firestore. Safe to run — aborts if data already exists.")
                            .font(.caption)
                            .foregroundColor(Color("SecondaryTextColor"))

                        if !seedStatus.isEmpty {
                            Text(seedStatus)
                                .font(.caption)
                                .foregroundColor(seedStatus.contains("✓") ? .green : .red)
                        }

                        Button(isSeeding ? "Seeding…" : "Run Seed") {
                            showSeedConfirm = true
                        }
                        .disabled(isSeeding)
                        .buttonStyle(CustomButtonStyle())
                    }
                }

                AdminCard(title: "Active Season", icon: "calendar") {
                    HStack {
                        Text("Current: \(appState.activeSeason)")
                            .foregroundColor(Color("TextColor"))
                        Spacer()
                        NavigationLink("Change") {
                            SeasonChangeView()
                        }
                        .foregroundColor(Color("AccentColor"))
                    }
                }

                AdminCard(title: "Stats", icon: "chart.bar") {
                    VStack(alignment: .leading, spacing: 6) {
                        StatRow(label: "Players", value: "\(appState.players.count)")
                        StatRow(label: "Draft Picks", value: "\(appState.draftPicks.count)")
                        StatRow(label: "Trades", value: "\(appState.trades.count)")
                    }
                }
            }
            .padding()
        }
        .confirmationDialog("Run seed?", isPresented: $showSeedConfirm, titleVisibility: .visible) {
            Button("Seed Database", role: .destructive) { runSeed() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This will populate Firestore with all 2026 IFFL data. It aborts if data already exists.")
        }
    }

    private func runSeed() {
        guard let uid = Auth.auth().currentUser?.uid else { return }
        isSeeding = true
        seedStatus = "Seeding…"
        DataSeeder().seedIfNeeded(commissionerUID: uid) { result in
            DispatchQueue.main.async {
                isSeeding = false
                switch result {
                case .success(let msg): seedStatus = "✓ \(msg)"
                case .failure(let err): seedStatus = "✗ \(err.localizedDescription)"
                }
            }
        }
    }
}

// MARK: - Players Section

struct AdminPlayersSection: View {
    @EnvironmentObject var appState: AppState
    @State private var showAddPlayer: Bool = false
    @State private var editingPlayer: Player? = nil

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("\(appState.players.count) Players")
                    .foregroundColor(Color("SecondaryTextColor"))
                    .font(.caption)
                Spacer()
                Button { showAddPlayer = true } label: {
                    Label("Add", systemImage: "plus")
                        .font(.caption)
                }
                .foregroundColor(Color("AccentColor"))
            }
            .padding(.horizontal)
            .padding(.vertical, 8)

            List {
                ForEach(appState.players.sorted { $0.name < $1.name }) { player in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(player.name)
                                .foregroundColor(Color("TextColor"))
                                .font(.subheadline).bold()
                            Text("\(player.position) · \(player.teamName)")
                                .foregroundColor(Color("SecondaryTextColor"))
                                .font(.caption)
                        }
                        Spacer()
                        Text("$\(player.currentPrice(season: appState.activeSeason))")
                            .foregroundColor(Color("Price2025Color"))
                            .font(.subheadline).bold()
                    }
                    .contentShape(Rectangle())
                    .onTapGesture { editingPlayer = player }
                    .listRowBackground(Color("CardBackgroundColor"))
                }
            }
            .listStyle(PlainListStyle())
        }
        .sheet(isPresented: $showAddPlayer) { PlayerEditView(player: nil) }
        .sheet(item: $editingPlayer) { player in PlayerEditView(player: player) }
    }
}

// MARK: - Player Edit / Add View

struct PlayerEditView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) var dismiss

    let player: Player?

    @State private var name: String = ""
    @State private var position: String = "QB"
    @State private var teamName: String = ""
    @State private var playerPool: String = "Auction"
    @State private var purchaseYear: String = ""
    @State private var contractYears: String = ""
    @State private var originalPrice: String = ""
    @State private var price2026: String = ""
    @State private var price2027: String = ""
    @State private var price2028: String = ""
    @State private var isSaving: Bool = false
    @State private var errorMsg: String = ""

    private let positions   = ["QB","RB","WR","TE"]
    private let pools       = ["Auction","Rookie Draft","Free Agent","Draft Pick"]

    var body: some View {
        NavigationStack {
            Form {
                Section("Identity") {
                    TextField("Player Name", text: $name)
                    Picker("Position", selection: $position) {
                        ForEach(positions, id: \.self) { Text($0) }
                    }
                    Picker("Team", selection: $teamName) {
                        ForEach(fantasyTeams.map { $0.name }, id: \.self) { Text($0) }
                    }
                    Picker("Player Pool", selection: $playerPool) {
                        ForEach(pools, id: \.self) { Text($0) }
                    }
                }

                Section("Contract") {
                    TextField("Purchase Year (e.g. 2025)", text: $purchaseYear)
                        .keyboardType(.numberPad)
                    TextField("Contract Years Remaining", text: $contractYears)
                        .keyboardType(.numberPad)
                    TextField("Original Price", text: $originalPrice)
                        .keyboardType(.numberPad)
                }

                Section("Prices") {
                    TextField("2026 Price", text: $price2026).keyboardType(.numberPad)
                    TextField("2027 Price", text: $price2027).keyboardType(.numberPad)
                    TextField("2028 Price", text: $price2028).keyboardType(.numberPad)
                }

                if !errorMsg.isEmpty {
                    Section { Text(errorMsg).foregroundColor(.red).font(.caption) }
                }
            }
            .navigationTitle(player == nil ? "Add Player" : "Edit Player")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSaving ? "Saving…" : "Save") { save() }
                        .disabled(isSaving || name.isEmpty || teamName.isEmpty)
                }
            }
            .onAppear { populateFields() }
        }
    }

    private func populateFields() {
        teamName = fantasyTeams.first?.name ?? ""
        guard let p = player else { return }
        name          = p.name
        position      = p.position
        teamName      = p.teamName
        playerPool    = p.playerPool
        purchaseYear  = String(p.purchaseYear)
        contractYears = String(p.contractYearsRemaining)
        originalPrice = String(p.originalPrice)
        price2026     = String(p.prices["2026"] ?? 0)
        price2027     = String(p.prices["2027"] ?? 0)
        price2028     = String(p.prices["2028"] ?? 0)
    }

    private func save() {
        guard !name.isEmpty, !teamName.isEmpty else { return }
        isSaving = true

        var updated = player ?? Player(
            teamName: teamName, position: position, name: name,
            prices: [:], originalPrice: 0, purchaseYear: 2026,
            contractYearsRemaining: 1, playerPool: playerPool,
            isActive: true, acquiredSeason: appState.activeSeason
        )
        updated.name                   = name
        updated.position               = position
        updated.teamName               = teamName
        updated.playerPool             = playerPool
        updated.purchaseYear           = Int(purchaseYear) ?? 2026
        updated.contractYearsRemaining = Int(contractYears) ?? 1
        updated.originalPrice          = Int(originalPrice) ?? 0
        updated.prices                 = [
            "2026": Int(price2026) ?? 0,
            "2027": Int(price2027) ?? 0,
            "2028": Int(price2028) ?? 0
        ]

        if player == nil {
            appState.dataService.addPlayer(updated) { error in
                finalize(error: error)
            }
        } else {
            appState.dataService.updatePlayer(updated) { error in
                finalize(error: error)
            }
        }
    }

    private func finalize(error: Error?) {
        DispatchQueue.main.async {
            isSaving = false
            if let e = error { errorMsg = e.localizedDescription }
            else { dismiss() }
        }
    }
}

// MARK: - Picks Section

struct AdminPicksSection: View {
    @EnvironmentObject var appState: AppState
    @State private var convertingPick: DraftPickAsset? = nil

    var body: some View {
        VStack(spacing: 0) {
            Text("\(appState.draftPicks.count) Available Picks")
                .foregroundColor(Color("SecondaryTextColor"))
                .font(.caption)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal)
                .padding(.vertical, 8)

            List {
                ForEach(appState.draftPicks.sorted {
                    if $0.season != $1.season { return $0.season < $1.season }
                    if $0.round  != $1.round  { return $0.round  < $1.round  }
                    return ($0.slot ?? 99) < ($1.slot ?? 99)
                }) { pick in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(pick.displayName)
                                .foregroundColor(Color("TextColor"))
                                .font(.subheadline).bold()
                            Text(pick.currentTeamName)
                                .foregroundColor(Color("SecondaryTextColor"))
                                .font(.caption)
                        }
                        Spacer()
                        Button("Draft Player") {
                            convertingPick = pick
                        }
                        .font(.caption)
                        .foregroundColor(Color("AccentColor"))
                    }
                    .listRowBackground(Color("CardBackgroundColor"))
                }
            }
            .listStyle(PlainListStyle())
        }
        .sheet(item: $convertingPick) { pick in
            PickConversionView(pick: pick)
        }
    }
}

// MARK: - Pick Conversion (Pick → Player)

struct PickConversionView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) var dismiss

    let pick: DraftPickAsset

    @State private var playerName: String = ""
    @State private var nflTeam: String = ""
    @State private var position: String = "WR"
    @State private var isSaving: Bool = false
    @State private var errorMsg: String = ""

    private let positions = ["QB","RB","WR","TE"]

    var body: some View {
        NavigationStack {
            Form {
                Section("Pick Info") {
                    LabeledContent("Pick", value: pick.displayName)
                    LabeledContent("Owner", value: pick.currentTeamName)
                    LabeledContent("Original Team", value: pick.originalTeamName)
                }

                Section("Rookie Player") {
                    TextField("Player Name", text: $playerName)
                    TextField("NFL Team (optional)", text: $nflTeam)
                    Picker("Position", selection: $position) {
                        ForEach(positions, id: \.self) { Text($0) }
                    }
                }

                if !errorMsg.isEmpty {
                    Section { Text(errorMsg).foregroundColor(.red).font(.caption) }
                }
            }
            .navigationTitle("Convert Pick")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSaving ? "Saving…" : "Confirm") { convertPick() }
                        .disabled(isSaving || playerName.isEmpty)
                }
            }
        }
    }

    private func convertPick() {
        isSaving = true
        appState.dataService.convertPickToPlayer(
            pick: pick,
            playerName: playerName,
            nflTeam: nflTeam.isEmpty ? nil : nflTeam,
            position: position
        ) { error in
            DispatchQueue.main.async {
                isSaving = false
                if let e = error { errorMsg = e.localizedDescription }
                else { dismiss() }
            }
        }
    }
}

// MARK: - Trades Section (Commissioner)

struct AdminTradesSection: View {
    @EnvironmentObject var appState: AppState

    private var pendingTrades: [Trade] {
        appState.trades.filter { $0.status == .accepted || $0.status == .proposed }
    }

    var body: some View {
        if pendingTrades.isEmpty {
            VStack(spacing: 12) {
                Spacer()
                Image(systemName: "checkmark.circle")
                    .font(.largeTitle)
                    .foregroundColor(Color("SecondaryTextColor"))
                Text("No trades awaiting execution")
                    .foregroundColor(Color("SecondaryTextColor"))
                Spacer()
            }
        } else {
            List {
                ForEach(pendingTrades) { trade in
                    AdminTradeRow(trade: trade)
                        .listRowBackground(Color("CardBackgroundColor"))
                }
            }
            .listStyle(PlainListStyle())
        }
    }
}

struct AdminTradeRow: View {
    @EnvironmentObject var appState: AppState
    let trade: Trade
    @State private var showConfirm: Bool = false
    @State private var isExecuting: Bool = false
    @State private var errorMsg: String = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("\(trade.proposingTeamName) ↔ \(trade.receivingTeamName)")
                    .font(.subheadline).bold()
                    .foregroundColor(Color("TextColor"))
                Spacer()
                StatusBadge(status: trade.status)
            }

            HStack(alignment: .top, spacing: 16) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(trade.proposingTeamName) gives:")
                        .font(.caption).foregroundColor(Color("SecondaryTextColor"))
                    ForEach(trade.proposerAssetNames, id: \.self) {
                        Text("• \($0)").font(.caption).foregroundColor(Color("TextColor"))
                    }
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(trade.receivingTeamName) gives:")
                        .font(.caption).foregroundColor(Color("SecondaryTextColor"))
                    ForEach(trade.receiverAssetNames, id: \.self) {
                        Text("• \($0)").font(.caption).foregroundColor(Color("TextColor"))
                    }
                }
            }

            if !errorMsg.isEmpty {
                Text(errorMsg).font(.caption).foregroundColor(.red)
            }

            // Only show execute for accepted trades (ESPN confirmed)
            if trade.status == .accepted {
                Button(isExecuting ? "Executing…" : "Execute Trade (ESPN Confirmed)") {
                    showConfirm = true
                }
                .disabled(isExecuting)
                .font(.caption)
                .foregroundColor(.white)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(Color("AccentColor"))
                .clipShape(Capsule())
            }
        }
        .padding(.vertical, 4)
        .confirmationDialog("Execute this trade?", isPresented: $showConfirm, titleVisibility: .visible) {
            Button("Execute", role: .destructive) { executeTrade() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This will permanently transfer all assets. This matches the ESPN-confirmed trade.")
        }
    }

    private func executeTrade() {
        guard let id = trade.id else { return }
        isExecuting = true
        appState.dataService.executeTrade(tradeId: id) { error in
            DispatchQueue.main.async {
                isExecuting = false
                if let e = error { errorMsg = e.localizedDescription }
            }
        }
    }
}

struct StatusBadge: View {
    let status: TradeStatus
    var body: some View {
        Text(status.rawValue.capitalized)
            .font(.caption2)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(statusColor.opacity(0.2))
            .foregroundColor(statusColor)
            .clipShape(Capsule())
    }
    private var statusColor: Color {
        switch status {
        case .proposed:  return .orange
        case .accepted:  return .green
        case .rejected:  return .red
        case .completed: return .blue
        default:         return .gray
        }
    }
}

// MARK: - Messages Section

struct AdminMessagesSection: View {
    @EnvironmentObject var appState: AppState
    @State private var newMessage: String = ""
    @State private var isSending: Bool = false

    var body: some View {
        VStack(spacing: 0) {
            // Compose
            VStack(spacing: 8) {
                TextEditor(text: $newMessage)
                    .frame(height: 80)
                    .padding(8)
                    .background(Color("CardBackgroundColor"))
                    .cornerRadius(8)
                    .foregroundColor(Color("TextColor"))

                Button(isSending ? "Sending…" : "Post Message") {
                    postMessage()
                }
                .disabled(isSending || newMessage.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .buttonStyle(CustomButtonStyle())
            }
            .padding()

            Divider().background(Color("SecondaryTextColor"))

            // Existing messages
            List {
                ForEach(appState.messages) { message in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(message.content)
                            .foregroundColor(Color("TextColor"))
                            .font(.subheadline)
                        Text(message.timestamp, style: .relative)
                            .foregroundColor(Color("SecondaryTextColor"))
                            .font(.caption)
                    }
                    .swipeActions {
                        Button(role: .destructive) { deleteMessage(message) } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    }
                    .listRowBackground(Color("CardBackgroundColor"))
                }
            }
            .listStyle(PlainListStyle())
        }
    }

    private func postMessage() {
        let content = newMessage.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !content.isEmpty else { return }
        isSending = true
        appState.dataService.addMessage(content: content) { _ in
            DispatchQueue.main.async {
                isSending = false
                newMessage = ""
            }
        }
    }

    private func deleteMessage(_ message: Message) {
        guard let id = message.id else { return }
        appState.dataService.deleteMessage(messageId: id) { _ in }
    }
}

// MARK: - Access Management Section

struct AdminAccessSection: View {
    @EnvironmentObject var appState: AppState
    @State private var newUID: String = ""
    @State private var config: LeagueConfig? = nil
    @State private var isLoading: Bool = true
    @State private var statusMsg: String = ""

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                AdminCard(title: "Your UID", icon: "person.badge.key") {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Share this with the commissioner to grant access:")
                            .font(.caption)
                            .foregroundColor(Color("SecondaryTextColor"))
                        if let uid = appState.currentUserUID {
                            Text(uid)
                                .font(.system(.caption, design: .monospaced))
                                .foregroundColor(Color("TextColor"))
                                .textSelection(.enabled)
                        }
                    }
                }

                AdminCard(title: "Authorized Users", icon: "person.2.badge.gearshape") {
                    VStack(alignment: .leading, spacing: 8) {
                        if isLoading {
                            ProgressView()
                        } else {
                            ForEach(config?.authorizedUIDs ?? [], id: \.self) { uid in
                                HStack {
                                    Text(uid)
                                        .font(.system(.caption, design: .monospaced))
                                        .foregroundColor(Color("TextColor"))
                                        .lineLimit(1)
                                        .truncationMode(.middle)
                                    Spacer()
                                    Button {
                                        revokeUID(uid)
                                    } label: {
                                        Image(systemName: "minus.circle.fill")
                                            .foregroundColor(.red)
                                    }
                                    .disabled(uid == appState.currentUserUID)
                                }
                            }

                            Divider()

                            HStack {
                                TextField("Paste UID to grant access", text: $newUID)
                                    .font(.system(.caption, design: .monospaced))
                                    .autocapitalization(.none)
                                Button("Add") { grantUID() }
                                    .disabled(newUID.isEmpty)
                                    .foregroundColor(Color("AccentColor"))
                            }

                            if !statusMsg.isEmpty {
                                Text(statusMsg)
                                    .font(.caption)
                                    .foregroundColor(statusMsg.contains("✓") ? .green : .red)
                            }
                        }
                    }
                }
            }
            .padding()
        }
        .onAppear { loadConfig() }
    }

    private func loadConfig() {
        appState.dataService.fetchLeagueConfig { cfg in
            DispatchQueue.main.async {
                config = cfg
                isLoading = false
            }
        }
    }

    private func grantUID() {
        let uid = newUID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !uid.isEmpty else { return }
        appState.dataService.addAuthorizedUID(uid) { error in
            DispatchQueue.main.async {
                if let e = error { statusMsg = "✗ \(e.localizedDescription)" }
                else { statusMsg = "✓ Access granted"; newUID = ""; loadConfig() }
            }
        }
    }

    private func revokeUID(_ uid: String) {
        appState.dataService.removeAuthorizedUID(uid) { error in
            DispatchQueue.main.async {
                if let e = error { statusMsg = "✗ \(e.localizedDescription)" }
                else { statusMsg = "✓ Access revoked"; loadConfig() }
            }
        }
    }
}

// MARK: - Season Change View

struct SeasonChangeView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) var dismiss
    @State private var newYear: String = ""
    @State private var isSaving: Bool = false

    var body: some View {
        Form {
            Section("New Active Season Year") {
                TextField("e.g. 2027", text: $newYear)
                    .keyboardType(.numberPad)
            }
            Section {
                Button(isSaving ? "Saving…" : "Update") {
                    guard let year = Int(newYear) else { return }
                    isSaving = true
                    appState.dataService.updateActiveSeasonYear(year) { _ in
                        DispatchQueue.main.async {
                            appState.activeSeason = year
                            isSaving = false
                            dismiss()
                        }
                    }
                }
                .disabled(isSaving || Int(newYear) == nil)
            }
        }
        .navigationTitle("Change Season")
        .onAppear { newYear = String(appState.activeSeason) }
    }
}

// MARK: - Reusable Admin Components

struct AdminCard<Content: View>: View {
    let title: String
    let icon: String
    let content: Content

    init(title: String, icon: String, @ViewBuilder content: () -> Content) {
        self.title   = title
        self.icon    = icon
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label(title, systemImage: icon)
                .font(.headline)
                .foregroundColor(Color("TextColor"))
            content
        }
        .padding()
        .background(Color("CardBackgroundColor"))
        .cornerRadius(12)
        .shadow(radius: 3)
    }
}

struct StatRow: View {
    let label: String
    let value: String
    var body: some View {
        HStack {
            Text(label).foregroundColor(Color("SecondaryTextColor")).font(.subheadline)
            Spacer()
            Text(value).foregroundColor(Color("TextColor")).font(.subheadline).bold()
        }
    }
}
