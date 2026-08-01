import SwiftUI

struct SettingsView: View {
    @ObservedObject var vm: RelayViewModel
    @State private var hostDraft: String = ""
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        Form {
            Section("WhatsApp session") {
                WhatsAppSessionRow(session: vm.whatsappSession, hostUrl: hostDraft.isEmpty ? vm.hostURL : hostDraft)
                Button("Refresh status") {
                    vm.refreshWhatsAppSession()
                }
            }

            Section("Backend") {
                TextField("Host URL", text: $hostDraft)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .keyboardType(.URL)
                Text("Simulator: http://127.0.0.1:3000\nDevice: http://YOUR_PC_LAN_IP:4500 (Docker) or :3000 (local Node)\n127.0.0.1 does not work on a real iPhone.")
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
            vm.startWhatsAppSessionPolling()
        }
        .onDisappear {
            vm.stopWhatsAppSessionPolling()
        }
    }
}

private struct WhatsAppSessionRow: View {
    let session: WhatsAppSessionStatus
    let hostUrl: String

    private var checking: Bool {
        session.loading && session.status == nil && session.error == nil
    }

    private var sessionOk: Bool {
        session.reachable && session.ok
    }

    private var headline: String {
        if checking { return "Checking..." }
        if sessionOk { return "OK" }
        return "Not OK"
    }

    private var detail: String {
        if checking { return "Checking health..." }
        if !session.reachable || session.error != nil {
            return session.error ?? "Backend unreachable"
        }
        if sessionOk { return "Connected (open)" }
        if session.status == "qr" || session.hasQr {
            let base = hostUrl.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            return "Needs QR scan — open \(base)/qr"
        }
        if session.status == "starting" { return "Starting... wait a moment" }
        if session.status == "close" { return "Disconnected — reconnecting or needs QR" }
        return "Status: \(session.status ?? "unknown")"
    }

    private var tint: Color {
        if checking { return .secondary }
        return sessionOk ? .green : .red
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            if checking {
                ProgressView()
            } else {
                Image(systemName: sessionOk ? "checkmark.circle.fill" : "xmark.circle.fill")
                    .foregroundStyle(tint)
                    .imageScale(.large)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(headline)
                    .font(.headline)
                    .foregroundStyle(tint)
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }
}
