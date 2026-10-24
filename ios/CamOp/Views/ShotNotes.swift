import SwiftUI

// A shot's details and the operator's own notes for it, kept on this device only
struct ShotNotes: View {
  let s: Plan.Shot, cam: Cam?
  @AppStorage private var text: String
  @Environment(\.dismiss) private var dismiss

  // shortcut: keyed by show title and cue id, so untitled shows share notes; key by a show id if the director sends one
  init(s: Plan.Shot, cam: Cam?, show: String) {
    self.s = s; self.cam = cam
    _text = AppStorage(wrappedValue: "", Self.key(show, s.id))
  }
  static func key(_ show: String, _ id: Int) -> String { "note.\(show).\(id)" }

  var body: some View {
    NavigationStack {
      Form {
        Section {
          LabeledContent("Camera", value: "CAM \(s.cam)" + (cam.map { "  \($0.name)" } ?? ""))
          LabeledContent("Length", value: String(format: "%.1fs", s.end - s.start))
          if !s.note.isEmpty { Text(s.note.uppercased()).font(.headline) }
        }
        Section("My notes") {
          TextEditor(text: $text).frame(minHeight: 160)
        }
      }
      .navigationTitle("Shot \(s.no)")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar { Button("Done") { dismiss() } }
    }
    .presentationDetents([.medium, .large])
  }
}
