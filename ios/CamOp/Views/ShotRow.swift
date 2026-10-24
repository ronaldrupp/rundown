import SwiftUI

// One waterfall row: the shot's bar slides in from the right across a 16 second window
struct ShotRow: View {
  let s: Plan.Shot, cams: [Cam], now: Double, live: Bool
  var outlined = false

  var body: some View {
    let c = cams.first { $0.id == s.cam }
    HStack(spacing: 0) {
      Text("\(s.no)").font(.subheadline.monospacedDigit()).foregroundStyle(.secondary).frame(width: 36, alignment: .trailing).padding(.trailing, 8)
      Text("\(s.cam)").font(.title2.bold()).frame(width: 52).frame(maxHeight: .infinity).background(Color(hex: c?.color))
      // only the bar slides; the description stays put at the left
      ZStack(alignment: .leading) {
        TimeBar(s: s, color: Color(hex: c?.color).opacity(0.55), now: now)
        VStack(alignment: .leading, spacing: 1) {
          Text(dur(s.end - s.start)).font(.caption.monospacedDigit()).foregroundStyle(.secondary)
          Text((s.note.isEmpty ? c?.name ?? "" : s.note).uppercased()).font(.subheadline.weight(live ? .bold : .regular)).lineLimit(1)
        }
        .padding(.horizontal, 8)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .frame(height: 50)
    .background(.white.opacity(0.07))
    .clipShape(.rect(cornerRadius: 10))
    .overlay { if outlined { RoundedRectangle(cornerRadius: 10).strokeBorder(.white.opacity(0.35), lineWidth: 2) } }
    .opacity(s.end <= now ? 0.4 : 1)
  }
}

// The shot's bar sliding in from the right across a 16 second window, shrinking into the left edge while live
struct TimeBar: View {
  static let start: CGFloat = 96 // every row's bar area begins here: number column + camera column
  let s: Plan.Shot, color: Color, now: Double
  private let window = 16.0

  var body: some View {
    GeometryReader { g in
      Rectangle().fill(color)
        .frame(width: g.size.width * max(0, s.end - max(s.start, now)) / window)
        .offset(x: g.size.width * max(0, s.start - now) / window)
    }
    .clipped()
  }
}
