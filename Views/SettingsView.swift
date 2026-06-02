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
                Color.iffBg.ignoresSafeArea()
                Form {
                    profileSection
                    appearanceSection
                    leagueSection
                    notificationsSection
                }
                .scrollContentBackground(.hidden)
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .foregroundColor(Color.iffAccent)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSaving ? "Saving…" : "Save") { save() }
                        .disabled(isSaving)
                        .foregroundColor(Color.iffAccent)
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
                Text("Name").foregroundColor(Color.iffSubtext)
                Spacer()
                Text(Auth.auth().currentUser?.displayName ?? "—")
                    .foregroundColor(Color.iffSubtext)
            }
            Picker("ESPN Team", selection: $selectedTeam) {
                ForEach(fantasyTeams.map { $0.name }, id: \.self) {
                    Text($0).tag($0)
                }
            }
            .pickerStyle(.menu)
            .tint(Color.iffAccent)
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
        .listRowBackground(Color.iffSurface)
    }

    // MARK: Appearance

    private var appearanceSection: some View {
        Section("Appearance") {
            VStack(alignment: .leading, spacing: 10) {
                Text("Team Logo Icon")
                    .font(.caption).foregroundColor(Color.iffSubtext)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 12) {
                        ForEach(logoPresets, id: \.self) { symbol in
                            Button {
                                settings.teamLogoName = symbol
                            } label: {
                                Image(systemName: symbol)
                                    .font(.title2)
                                    .foregroundColor(settings.teamLogoName == symbol ? Color.iffAccent : Color.iffSubtext)
                                    .frame(width: 44, height: 44)
                                    .background(settings.teamLogoName == symbol ? Color.iffAccent.opacity(0.2) : Color.iffElevated)
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
                Text("Dark").font(.caption).foregroundColor(Color.iffSubtext)
            }
        }
        .listRowBackground(Color.iffSurface)
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
            .tint(Color.iffAccent)

            Toggle("Show Trade Values", isOn: $settings.showTradeValues)
                .tint(Color.iffAccent)
                .foregroundColor(.white)

            Toggle("Share My FMK Ratings", isOn: $settings.fmkPublic)
                .tint(Color.iffAccent)
                .foregroundColor(.white)
        }
        .listRowBackground(Color.iffSurface)
    }

    // MARK: Notifications

    private var notificationsSection: some View {
        Section("Notifications") {
            HStack(spacing: 10) {
                Image(systemName: "bell.badge")
                    .foregroundColor(Color.iffSubtext)
                Text("Push notifications — coming soon")
                    .font(.subheadline).foregroundColor(Color.iffSubtext)
            }
        }
        .listRowBackground(Color.iffSurface)
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
