import SwiftUI

struct SettingsView: View {
    @ObservedObject var vm: RelayViewModel
    @State private var hostDraft: String = ""
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        Form {
            Section("Backend") {
                TextField("Host URL", text: $hostDraft)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .keyboardType(.URL)
                Text("Simulator: http://127.0.0.1:3000 · Device: http://YOUR_LAN_IP:3000")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Button("Save host") {
                    vm.saveHost(hostDraft)
                    dismiss()
                }
            }

            if let username = vm.username {
                Section("Account") {
                    Text(username)
                }
            }

            Section("Notifications") {
                Button("Test local notification (5s)") {
                    vm.testLocalNotification()
                }
            }
        }
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            hostDraft = vm.hostURL
        }
    }
}
