import SwiftUI
import FirebaseAuth

// MARK: - Settings View (accessible to all users)

struct SettingsView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) var dismiss
    @State private var isSaving = false
    @State private var settings: UserSettings = UserSettings()
    @State private var selectedTeam: String = ""

    private let tabNames = ["Dashboard", "Rosters", "Market", "League"]

    private let logoPresets = [
        "flame.fill", "bolt.fill", "star.fill", "crown.fill",
        "shield.fill", "football.fill", "trophy.fill", "tornado",
        "leaf.fill", "burst.fill", "hexagon.fill", "diamond.fill"
    ]

    var body: some View {
        NavigationStack {
            ZStack {
                Color.beltBg.ignoresSafeArea()
                Form {
                    profileSection
                    appearanceSection
                    leagueSection
                    notificationsSection
                    aboutSection
                    signOutSection
                    versionFooter
                }
                .scrollContentBackground(.hidden)
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .foregroundColor(Color.beltAccent)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSaving ? "Saving…" : "Save") { save() }
                        .disabled(isSaving)
                        .foregroundColor(Color.beltAccent)
                }
            }
            .onAppear {
                settings = appState.userSettings
                selectedTeam = appState.userTeam
            }
        }
    }

    // MARK: Profile

    private var profileSection: some View {
        Section("Profile") {
            HStack {
                Text("Name").foregroundColor(Color.beltSubtext)
                Spacer()
                Text(Auth.auth().currentUser?.displayName ?? "—")
                    .foregroundColor(Color.beltSubtext)
            }
            HStack {
                Text("Email").foregroundColor(Color.beltSubtext)
                Spacer()
                Text(Auth.auth().currentUser?.email ?? "—")
                    .foregroundColor(Color.beltSubtext)
                    .font(.caption)
            }
            Picker("ESPN Team", selection: $selectedTeam) {
                ForEach(fantasyTeams.map { $0.name }, id: \.self) {
                    Text($0).tag($0)
                }
            }
            .pickerStyle(.menu)
            .tint(Color.beltAccent)
            HStack {
                Text("Nickname").foregroundColor(.white)
                Spacer()
                TextField("Optional", text: Binding(
                    get: { settings.displayNickname ?? "" },
                    set: { settings.displayNickname = $0.isEmpty ? nil : $0 }
                ))
                .foregroundColor(.white)
                .multilineTextAlignment(.trailing)
                .autocapitalization(.words)
            }
        }
        .listRowBackground(Color.beltSurface)
    }

    // MARK: Appearance

    private var appearanceSection: some View {
        Section("Appearance") {
            VStack(alignment: .leading, spacing: 10) {
                Text("Team Logo Icon")
                    .font(.caption).foregroundColor(Color.beltSubtext)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 12) {
                        ForEach(logoPresets, id: \.self) { symbol in
                            Button {
                                settings.teamLogoName = symbol
                            } label: {
                                Image(systemName: symbol)
                                    .font(.title2)
                                    .foregroundColor(settings.teamLogoName == symbol ? Color.beltAccent : Color.beltSubtext)
                                    .frame(width: 44, height: 44)
                                    .background(settings.teamLogoName == symbol ? Color.beltAccent.opacity(0.2) : Color.beltElevated)
                                    .clipShape(Circle())
                            }
                        }
                    }
                }
            }
            .padding(.vertical, 4)

            HStack {
                Text("Theme").foregroundColor(.white)
                Spacer()
                Text("Dark").font(.caption).foregroundColor(Color.beltSubtext)
            }
        }
        .listRowBackground(Color.beltSurface)
    }

    // MARK: League

    private var leagueSection: some View {
        Section("League") {
            Picker("Default Tab", selection: $settings.defaultTab) {
                ForEach(Array(tabNames.enumerated()), id: \.offset) { idx, name in
                    Text(name).tag(idx)
                }
            }
            .pickerStyle(.menu)
            .foregroundColor(.white)
            .tint(Color.beltAccent)

            Toggle("Show Trade Values", isOn: $settings.showTradeValues)
                .tint(Color.beltAccent)
                .foregroundColor(.white)

            Toggle("Share My FMK Ratings", isOn: $settings.fmkPublic)
                .tint(Color.beltAccent)
                .foregroundColor(.white)
        }
        .listRowBackground(Color.beltSurface)
    }

    // MARK: Notifications

    private var notificationsSection: some View {
        Section("Notifications") {
            HStack(spacing: 10) {
                Image(systemName: "bell.badge")
                    .foregroundColor(Color.beltSubtext)
                Text("Push notifications — coming soon")
                    .font(.subheadline).foregroundColor(Color.beltSubtext)
            }
        }
        .listRowBackground(Color.beltSurface)
    }

    // MARK: About

    private var aboutSection: some View {
        Section("About") {
            Link(destination: BeltLegal.privacyPolicyURL) {
                HStack(spacing: 10) {
                    Image(systemName: "hand.raised.fill")
                        .foregroundColor(Color.beltAccent)
                    Text("Privacy Policy")
                        .font(.subheadline).foregroundColor(.white)
                    Spacer()
                    Image(systemName: "arrow.up.right")
                        .font(.caption).foregroundColor(Color.beltSubtext)
                }
            }
        }
        .listRowBackground(Color.beltSurface)
    }

    // MARK: Sign Out

    private var signOutSection: some View {
        Section {
            Button(role: .destructive) {
                try? Auth.auth().signOut()
            } label: {
                HStack {
                    Spacer()
                    Text("Sign Out")
                        .font(.headline)
                    Spacer()
                }
            }
        }
        .listRowBackground(Color.iffSurface)
    }

    // MARK: Version Footer

    private var appVersion: String {
        let v = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "?"
        let b = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "?"
        return "IFFL \(v) (\(b))"
    }

    private var versionFooter: some View {
        Section {
            HStack {
                Spacer()
                Text(appVersion)
                    .font(.caption2)
                    .foregroundColor(Color.iffSubtext)
                Spacer()
            }
        }
        .listRowBackground(Color.clear)
    }

    // MARK: Save

    private func save() {
        isSaving = true
        appState.userSettings = settings

        let teamChanged = selectedTeam != appState.userTeam && !selectedTeam.isEmpty
        if teamChanged {
            if let uid = Auth.auth().currentUser?.uid {
                appState.dataService.assignTeam(uid: uid, teamName: selectedTeam) { _ in }
            }
            appState.userTeam = selectedTeam
            appState.selectedTeam = selectedTeam
        }

        appState.saveUserSettings { _ in
            DispatchQueue.main.async {
                isSaving = false
                dismiss()
            }
        }
    }
}
