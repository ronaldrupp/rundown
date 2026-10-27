import SwiftUI

struct SettingsSheet: View {
  @Binding var host: String
  @Binding var code: String
  @Binding var token: String
  @Binding var remote: Bool
  @State private var draft = ""
  @State private var codeDraft = ""
  @State private var email = ""
  @State private var password = ""
  @State private var error: String?
  @State private var busy = false
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationStack {
      Form {
        Section("Rundown server") {
          TextField("rundown.example.com or 192.168.1.10:5173", text: $draft)
            .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
        }
        Section {
          TextField("Join code", text: $codeDraft)
            .textInputAutocapitalization(.characters).autocorrectionDisabled().font(.body.monospaced())
        } header: { Text("Camera") } footer: {
          Text("The director's screen shows the code next to the LIVE button.")
        }
        Section {
          Toggle("Director remote", isOn: $remote)
          if remote {
            if token.isEmpty {
              TextField("Email", text: $email).keyboardType(.emailAddress).textContentType(.username)
                .textInputAutocapitalization(.never).autocorrectionDisabled()
              SecureField("Password", text: $password).textContentType(.password)
              if let error { Text(error).foregroundStyle(.red) }
              Button(busy ? "Signing in…" : "Sign in") { Task { await signIn() } }.disabled(busy || email.isEmpty || password.isEmpty)
            } else {
              Button("Sign out", role: .destructive) { token = "" }
            }
          }
        } footer: {
          Text("Shows the whole cut flow with play, pause and seek. Needs the director's login. The director's browser window stays the host.")
        }
      }
      .navigationTitle("Settings")
      .toolbar { Button("Done") { save(); dismiss() } }
    }
    .onAppear { draft = host; codeDraft = code }
  }

  private func save() {
    host = draft.trimmingCharacters(in: .whitespaces)
    code = codeDraft.trimmingCharacters(in: .whitespaces).uppercased()
  }

  private func signIn() async {
    busy = true; error = nil
    save() // sign in against the server typed above, even before Done
    do { token = try await Sync.login(host: host, email: email, password: password); password = "" }
    catch { self.error = error.localizedDescription }
    busy = false
  }
}
