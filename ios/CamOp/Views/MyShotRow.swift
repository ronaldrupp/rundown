import SwiftUI

// This camera's own upcoming shot: a list entry over its sliding bar, so the operator can read
// what to frame, when it goes live and how long it lasts and how long the reset is after it.
struct MyShotRow: View {
  let s: Plan.Shot, cams: [Cam], now: Double, live: Bool
  var memo = "" // the operator's own note from the shot sheet

  var body: some View {
    let c = cams.first { $0.id == s.cam }
    HStack(spacing: 12) {
      Text("\(s.no)").font(.subheadline.monospacedDigit()).foregroundStyle(.secondary).frame(width: 36, alignment: .trailing)
      RoundedRectangle(cornerRadius: 3).fill(Color(hex: c?.color)).frame(width: 6)
      VStack(alignment: .leading, spacing: 2) {
        Text(s.note.isEmpty ? c?.name ?? "" : s.note).font(.title3.weight(live ? .bold : .regular)).lineLimit(2)
        Text(dur(s.end - s.start) + (s.gap.map { " · \(dur($0)) reset" } ?? "")).font(.caption.monospacedDigit()).foregroundStyle(.secondary)
        if !memo.isEmpty { Label(memo, systemImage: "note.text").font(.subheadline).foregroundStyle(.yellow).lineLimit(3) }
      }
      Spacer()
      Text(live ? "LIVE" : s.end <= now ? "done" : "in \(dur(s.start - now))").font(.title3.monospacedDigit().bold())
    }
    .padding(.horizontal, 8).padding(.vertical, 10)
    .background { TimeBar(s: s, color: Color(hex: c?.color).opacity(0.35), now: now).padding(.leading, TimeBar.start) } // same playhead as the shot flow
    .background(live ? .red.opacity(0.35) : .white.opacity(0.07))
    .clipShape(.rect(cornerRadius: 10))
    .opacity(s.end <= now ? 0.4 : 1)
  }
}
