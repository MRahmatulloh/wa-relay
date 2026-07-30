import SwiftUI

struct AuthView: View {
    @ObservedObject var vm: RelayViewModel
    @State private var username = ""
    @State private var password = ""

    var body: some View {
        VStack(spacing: 20) {
            Spacer()
            Text("WA Relay")
                .font(.largeTitle.weight(.semibold))
            Text("Sign in to your relay account")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            VStack(spacing: 12) {
                TextField("Username", text: $username)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .textFieldStyle(.roundedBorder)
                SecureField("Password", text: $password)
                    .textFieldStyle(.roundedBorder)
            }
            .padding(.horizontal)

            if let error = vm.error {
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }
            if let info = vm.info {
                Text(info)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            Button {
                vm.clearFlash()
                vm.login(username: username, password: password)
            } label: {
                if vm.loading {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                } else {
                    Text("Login")
                        .frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(vm.loading || username.trimmingCharacters(in: .whitespaces).isEmpty || password.isEmpty)
            .padding(.horizontal)

            Spacer()
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    vm.path.append(.settings)
                } label: {
                    Image(systemName: "gearshape")
                }
            }
        }
    }
}
