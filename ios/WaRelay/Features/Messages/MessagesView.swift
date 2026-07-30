import SwiftUI

struct MessagesView: View {
    @ObservedObject var vm: RelayViewModel
    @State private var showSearch = false

    var body: some View {
        VStack(spacing: 0) {
            folderBar
            if showSearch {
                TextField("Search messages", text: Binding(
                    get: { vm.searchQuery },
                    set: { vm.setSearchQuery($0) }
                ))
                .textFieldStyle(.roundedBorder)
                .padding(.horizontal)
                .padding(.vertical, 8)
            }

            if let error = vm.error {
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .padding(.horizontal)
            }

            ZStack(alignment: .bottomTrailing) {
                if vm.loading && vm.messages.isEmpty {
                    ProgressView("Loading…")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if vm.messages.isEmpty {
                    VStack(spacing: 12) {
                        Image(systemName: "tray")
                            .font(.system(size: 40))
                            .foregroundStyle(.secondary)
                        Text("No messages")
                            .font(.headline)
                        Text("Matched WhatsApp messages will appear here.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    ScrollViewReader { proxy in
                        List {
                            ForEach(vm.messages) { msg in
                                MessageRow(
                                    message: msg,
                                    expanded: vm.expandedId == msg.rowId,
                                    onToggle: { vm.toggleExpanded(msg) },
                                    onStar: { vm.toggleStar(msg) },
                                    onDone: { vm.toggleDone(msg) },
                                    onOpenWhatsApp: { vm.openWhatsApp(msg.waLink) }
                                )
                                .id(msg.rowId)
                                .onAppear {
                                    if msg.rowId == vm.messages.last?.rowId {
                                        vm.loadMore()
                                    }
                                }
                            }
                            if vm.loadingMore {
                                HStack {
                                    Spacer()
                                    ProgressView()
                                    Spacer()
                                }
                            }
                        }
                        .listStyle(.plain)
                        .refreshable { vm.refresh() }
                        .overlay(alignment: .bottomTrailing) {
                            if let first = vm.messages.first {
                                Button {
                                    withAnimation {
                                        proxy.scrollTo(first.rowId, anchor: .top)
                                    }
                                } label: {
                                    Image(systemName: "arrow.up")
                                        .padding()
                                        .background(.ultraThinMaterial, in: Circle())
                                }
                                .padding()
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Inbox")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Menu {
                    ForEach(InboxFilter.allCases) { f in
                        Button {
                            vm.setFilter(f)
                        } label: {
                            HStack {
                                Text(f.label)
                                if vm.filter == f {
                                    Image(systemName: "checkmark")
                                }
                            }
                        }
                    }
                } label: {
                    Image(systemName: "line.3.horizontal.decrease.circle")
                }
            }
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button {
                    showSearch.toggle()
                } label: {
                    Image(systemName: showSearch ? "xmark" : "magnifyingglass")
                }
                Button { vm.refresh() } label: {
                    Image(systemName: "arrow.clockwise")
                }
                Button { vm.path.append(.settings) } label: {
                    Image(systemName: "gearshape")
                }
                Button { vm.logout() } label: {
                    Image(systemName: "rectangle.portrait.and.arrow.right")
                }
            }
        }
    }

    private var folderBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(InboxFolder.allCases) { folder in
                    let count = vm.folderUnread[folder.apiValue] ?? 0
                    Button {
                        vm.setFolder(folder)
                    } label: {
                        HStack(spacing: 4) {
                            Text(folder.label)
                                .font(.subheadline.weight(vm.folder == folder ? .semibold : .regular))
                            if count > 0 {
                                Text("\(count)")
                                    .font(.caption2.weight(.bold))
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 2)
                                    .background(Capsule().fill(Color.accentColor.opacity(0.2)))
                            }
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(
                            Capsule()
                                .strokeBorder(vm.folder == folder ? Color.accentColor : Color.secondary.opacity(0.3))
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 8)
        }
    }
}

private struct MessageRow: View {
    let message: MatchedMessage
    let expanded: Bool
    let onToggle: () -> Void
    let onStar: () -> Void
    let onDone: () -> Void
    let onOpenWhatsApp: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top) {
                if message.isUnread {
                    Circle()
                        .fill(Color.accentColor)
                        .frame(width: 8, height: 8)
                        .padding(.top, 6)
                }
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(message.senderName ?? message.senderPhone ?? "Unknown")
                            .font(.headline)
                            .lineLimit(1)
                        Spacer()
                        if message.isGroup {
                            Image(systemName: "person.3.fill")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        if message.starred {
                            Image(systemName: "star.fill")
                                .font(.caption)
                                .foregroundStyle(.yellow)
                        }
                        if message.done {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.caption)
                                .foregroundStyle(.green)
                        }
                    }
                    Text(message.text)
                        .font(.subheadline)
                        .foregroundStyle(.primary)
                        .lineLimit(expanded ? nil : 2)
                    Text(metaLine)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }

            if expanded {
                HStack(spacing: 16) {
                    Button(action: onStar) {
                        Label(
                            message.starred ? "Unstar" : "Star",
                            systemImage: message.starred ? "star.fill" : "star"
                        )
                    }
                    Button(action: onDone) {
                        Label(
                            message.done ? "Undone" : "Done",
                            systemImage: message.done ? "checkmark.circle.fill" : "circle"
                        )
                    }
                    if message.waLink != nil {
                        Button(action: onOpenWhatsApp) {
                            Label("WhatsApp", systemImage: "arrow.up.right.square")
                        }
                    }
                }
                .font(.caption)
                .buttonStyle(.bordered)
            }
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
        .onTapGesture(perform: onToggle)
        .listRowBackground(message.isUnread ? Color.accentColor.opacity(0.06) : Color.clear)
    }

    private var metaLine: String {
        let inbound = formatTime(message.timestamp)
        let read = message.readAt.map { "Read: \(formatTime($0))" } ?? "Unread"
        return "In: \(inbound) · \(read)"
    }

    private func formatTime(_ iso: String?) -> String {
        guard let iso, let date = ISO8601DateFormatter().date(from: iso)
                ?? Self.fractional.date(from: iso) else {
            return iso ?? "—"
        }
        return Self.display.string(from: date)
    }

    private static let fractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let display: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .short
        f.timeStyle = .short
        return f
    }()
}
