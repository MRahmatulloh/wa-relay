import SwiftUI

struct RootView: View {
    @StateObject private var vm = RelayViewModel()

    var body: some View {
        Group {
            if !vm.sessionReady {
                SplashView()
            } else {
                NavigationStack(path: $vm.path) {
                    Group {
                        if vm.token == nil {
                            AuthView(vm: vm)
                        } else {
                            MessagesView(vm: vm)
                        }
                    }
                    .navigationDestination(for: RelayViewModel.AppRoute.self) { route in
                        switch route {
                        case .settings:
                            SettingsView(vm: vm)
                        }
                    }
                }
            }
        }
    }
}

struct SplashView: View {
    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "bubble.left.and.bubble.right.fill")
                .font(.system(size: 56))
                .foregroundStyle(.tint)
            Text("WA Relay")
                .font(.title.weight(.semibold))
            ProgressView()
        }
    }
}
