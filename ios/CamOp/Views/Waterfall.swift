import SwiftUI

// The web cam view's waterfall (src/CamView.vue): each shot's bar slides in from the right across a
// 16 second window, the whole cut flow on top, a countdown band, then this camera's own shots.
struct Waterfall<Header: View>: View {
  let plan: Plan, cams: [Cam], cam: Int, now: Double
  let show: String, pick: (Plan.Shot) -> Void
  @ViewBuilder var header: Header
  @Environment(\.verticalSizeClass) private var vSize
  // drag the countdown band to share height between shot flow and own shots, like the web view
  @AppStorage("camSplit") private var split = 0.5
  @State private var box = CGRect.zero // the stack in screen coordinates
  @State private var dragFrom: Double?
  @State private var snapped = false
  private let window = 16.0, bandHeight = 60.0

  var body: some View {
    if vSize == .compact {
      // phone on its side: shot flow left, countdown and own shots right, header across both
      HStack(spacing: 12) {
        flow
        VStack(spacing: 8) { band; own }
      }
      .safeAreaInset(edge: .top, spacing: 8) { header }
    } else {
      let lists = max(1, box.height - bandHeight - 16)
      VStack(spacing: 8) {
        flow.safeAreaInset(edge: .top, spacing: 16) { header }
          .frame(height: lists * split)
        band
          .frame(height: bandHeight)
          .contentShape(.rect)
          .gesture(DragGesture(coordinateSpace: .global).onChanged { v in // global: the band moves under the finger
            let from = dragFrom ?? split
            dragFrom = from
            // snap the band's centre to the screen's vertical centre when it comes within 20pt
            let screenMid = UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.screen.bounds.midY }.first ?? 0
            let centre = (screenMid - box.minY - 8 - bandHeight / 2) / lists, to = from + v.translation.height / lists
            snapped = abs(to - centre) * lists < 20
            split = min(0.85, max(0.15, snapped ? centre : to))
          }.onEnded { _ in dragFrom = nil; snapped = false })
          .sensoryFeedback(.alignment, trigger: snapped) { _, now in now }
          .accessibilityElement(children: .combine)
          .accessibilityHint("Swipe up or down to resize the shot lists")
          .accessibilityAdjustableAction { split = min(0.85, max(0.15, split + ($0 == .increment ? 0.05 : -0.05))) }
        own
      }
      .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { box = $0 }

    }
  }

  // past shots stay above the live one and scroll on up under the floating header
  private var flow: some View {
    LiveScroll(spacing: 3, live: plan.live?.id) { ForEach(plan.all) { s in
      Button { pick(s) } label: { ShotRow(s: s, cams: cams, now: now, live: s.id == plan.live?.id, outlined: s.cam == cam) }.buttonStyle(.plain)
    } }
    .frame(maxHeight: .infinity)
  }

  private var own: some View {
    LiveScroll(spacing: 3, live: plan.mine.first?.id) {
      ForEach(plan.own) { s in Button { pick(s) } label: { MyShotRow(s: s, cams: cams, now: now, live: s.id == plan.live?.id,
        memo: UserDefaults.standard.string(forKey: ShotNotes.key(show, s.id)) ?? "") }.buttonStyle(.plain) }
      if plan.mine.isEmpty { Text("No more shots for camera \(cam).").foregroundStyle(.secondary).padding() }
    }
    .frame(maxHeight: .infinity)
  }

  private var band: some View {
    let tint: Color = plan.onAir ? .red : plan.standby ? .green : .clear
    // the countdown track starts and ends where the shot bars do, so all share one playhead
    return HStack(spacing: 0) {
      VStack(spacing: 0) {
        Text(plan.left.map { "\(Int(max(0, $0).rounded(.up)))" } ?? "–").font(.title.weight(.heavy).monospacedDigit())
        Text(plan.onAir ? "ON AIR" : plan.standby ? "STANDBY" : plan.next != nil ? "NEXT IN" : "DONE")
          .font(.caption2.weight(.heavy)).tracking(1)
      }
      .frame(width: TimeBar.start)
      GeometryReader { g in
        Rectangle().fill(plan.standby ? .black : .white).frame(width: g.size.width * min(plan.left ?? 0, window) / window)
      }
      .frame(height: 26)
    }
    .foregroundStyle(plan.standby ? .black : .white)
    .padding(.vertical, 8)
    .glassEffect(.regular.tint(tint.opacity(0.8)), in: .rect(cornerRadius: 18))
  }
}
