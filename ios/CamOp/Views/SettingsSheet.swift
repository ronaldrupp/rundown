import SwiftUI

struct SettingsSheet: View {
  @Binding var host: String
  @Binding var remote: Bool
  @State private var draft = ""
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationStack {
      Form {
        Section("Director server") {
          TextField("192.168.1.10:5173", text: $draft)
            .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
        }
        Section {
          Toggle("Director remote", isOn: $remote)
        } footer: {
          Text("Shows the whole cut flow with play, pause and seek. The director's browser window stays the host.")
        }
      }
      .navigationTitle("Settings")
      .toolbar { Button("Done") { host = draft.trimmingCharacters(in: .whitespaces); dismiss() } }
    }
    .onAppear { draft = host }
  }
}
