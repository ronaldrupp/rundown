import SwiftUI

// Director on the move (iPad): the whole cut flow, what is on air and next, and the transport.
// The web director window stays the host; these buttons ask it to play, pause or seek.
struct DirectorRemote: View {
  let show: Show, sync: Sync, now: Double

  var body: some View {
    let plan = Plan(show: show, cam: -1, now: now)
    let next = plan.all.first { $0.start > now }
    VStack(spacing: 12) {
      HStack(spacing: 12) {
        card("ON AIR", plan.live, tint: .red, big: plan.live.map { "\($0.cam)" } ?? "–")
        card("NEXT", next, tint: .clear, big: next.map { String(format: "%.1f", $0.start - now) } ?? "–")
      }
      .fixedSize(horizontal: false, vertical: true)
      // tap a shot to jump the show there
      LiveScroll(spacing: 3, live: plan.live?.id) {
        ForEach(plan.all) { s in
          Button { sync.control("seek", t: s.start) } label: { ShotRow(s: s, cams: show.cams, now: now, live: s.id == plan.live?.id) }
            .buttonStyle(.plain)
            .accessibilityHint("Jumps the show to this cut")
        }
      }
      transport
    }
  }

  private func card(_ label: String, _ s: Plan.Shot?, tint: Color, big: String) -> some View {
    let c = show.cams.first { $0.id == s?.cam }
    return VStack(alignment: .leading, spacing: 4) {
      Text(label).font(.headline.weight(.heavy)).tracking(2)
      Text(big).font(.system(size: 64, weight: .bold, design: .rounded).monospacedDigit()).lineLimit(1).minimumScaleFactor(0.5)
      if let c { Text(c.name).font(.subheadline.bold()).lineLimit(1).padding(.horizontal, 10).padding(.vertical, 4).background(Color(hex: c.color), in: .capsule) }
      Text(s?.note.isEmpty == false ? s!.note : " ").font(.title3).lineLimit(2)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading).padding(20)
    .glassEffect(.regular.tint(tint.opacity(0.5)), in: .rect(cornerRadius: 28))
  }

  private var transport: some View {
    HStack(spacing: 16) {
      Button { sync.control("seek", t: 0) } label: { Image(systemName: "backward.end.fill") }
        .accessibilityLabel("To start")
      Button { sync.control("seek", t: max(0, now - show.bar)) } label: { Image(systemName: "gobackward") }
        .accessibilityLabel("Back one bar")
      Button { sync.control(sync.playing ? "pause" : "play") } label: {
        Image(systemName: sync.playing ? "pause.fill" : "play.fill").frame(width: 56, height: 40)
      }
      .buttonStyle(.glassProminent).tint(sync.playing ? .gray : .red)
      .accessibilityLabel(sync.playing ? "Pause" : "Play")
      Button { sync.control("seek", t: min(show.duration, now + show.bar)) } label: { Image(systemName: "goforward") }
        .accessibilityLabel("Forward one bar")
    }
    .font(.title2).buttonStyle(.glass)
    .padding(10)
    .glassEffect(in: .capsule)
  }
}
