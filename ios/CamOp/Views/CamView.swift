import SwiftUI

struct CamView: View {
  @State private var sync = Sync()
  @AppStorage("host") private var host = "localhost:5173"
  @AppStorage("cam") private var cam = 1
  @AppStorage("waterfall") private var waterfall = true
  @AppStorage("remote") private var remote = false // director remote instead of a camera
  @AppStorage("pips") private var pips = true
  @State private var settings = false
  @State private var picked: Plan.Shot? // shot open in the notes sheet
  @Environment(\.verticalSizeClass) private var vSize // compact: phone held sideways
  @State private var tone = Pips()

  var body: some View {
    TimelineView(.animation) { ctx in
      let now = sync.time(at: ctx.date)
      let cams = sync.show?.cams ?? []
      let me = cams.first { $0.id == cam }
      let color = Color(hex: me?.color)
      let mine = remote ? nil : sync.show.map { Plan(show: $0, cam: cam, now: now) }
      let onAir = mine?.onAir ?? false
      let n = sync.playing && !onAir ? mine?.left.map { Int($0.rounded(.up)) } : nil // whole seconds to the next cut
      ZStack {
        LinearGradient(colors: [color.opacity(0.35), .black], startPoint: .top, endPoint: .bottom).ignoresSafeArea()
        GlassEffectContainer(spacing: 16) {
          let flowing = sync.show != nil && waterfall && !remote
          VStack(spacing: 16) {
            if flowing, let show = sync.show {
              // the shot flow scrolls up under the header, the own shots run down to the bottom edge
              Waterfall(plan: Plan(show: show, cam: cam, now: now), cams: cams, cam: cam, now: now, show: show.title ?? "", pick: { picked = $0 }) {
                header(connected: sync.connected(at: ctx.date))
              }
            } else {
            header(connected: sync.connected(at: ctx.date))
            if let show = sync.show {
              let plan = Plan(show: show, cam: cam, now: now)
              if remote {
                DirectorRemote(show: show, sync: sync, now: now)
              } else {
              (vSize == .compact ? AnyLayout(HStackLayout(alignment: .top, spacing: 16)) : AnyLayout(VStackLayout(spacing: 16))) {
              hero(plan, color: color)
              LiveScroll(spacing: 10) {
                section("Your shots")
                ForEach(plan.mine) { s in Button { picked = s } label: { shotRow(s, now: now, cams: cams, live: s.id == plan.live?.id) }.buttonStyle(.plain) }
                if plan.mine.isEmpty { Text("No more shots").foregroundStyle(.secondary) }
                section("Shot flow")
                ForEach(plan.all.filter { $0.end > now }) { s in Button { picked = s } label: { shotRow(s, now: now, cams: cams, live: s.id == plan.live?.id) }.buttonStyle(.plain) }
              }
              }
              }
            } else {
              ContentUnavailableView("Waiting for the director", systemImage: "antenna.radiowaves.left.and.right",
                                     description: Text("Start the director view on \(host)"))
            }
            }
          }
          .padding(flowing ? .horizontal : .all) // flowing lists touch the safe area edges, so they scroll on under the status bar and home indicator
        }
        // tally frame like the web view: follows the display's rounded corners, a soft glow fading inward
        TallyFrame(color: onAir ? .red : .green).opacity(onAir || mine?.standby == true ? 1 : 0) // no fade: it must show the instant the cut happens
      }
      .onChange(of: onAir) { _, on in if on && sync.playing { cue(1500, ms: 400) } }
      .onChange(of: n) { _, n in if let n, (1...3).contains(n) { cue(1000, ms: 90) } }
    }
    .task(id: host) { await sync.run(host: host) }
    .sheet(item: $picked) { s in ShotNotes(s: s, cam: sync.show?.cams.first { $0.id == s.cam }, show: sync.show?.title ?? "") }
    .sheet(isPresented: $settings) { SettingsSheet(host: $host, remote: $remote) }
  }

  private func cue(_ freq: Double, ms: Double) {
    guard pips else { return }
    tone.pip(freq, ms: ms)
  }

  private func header(connected: Bool) -> some View {
    HStack(alignment: .top) {
      // tap the camera to switch which one this device follows (or the director remote)
      Menu {
        Picker("View", selection: Binding(get: { remote ? -1 : cam }, set: { remote = $0 == -1; if $0 != -1 { cam = $0 } })) {
          ForEach(sync.show?.cams ?? []) { Text("CAM \($0.id)  \($0.name)").tag($0.id) }
          Text("Director remote").tag(-1)
        }
      } label: {
        HStack(spacing: 8) {
          Circle().fill(connected ? .green : .red).frame(width: 8, height: 8)
            .accessibilityLabel(connected ? "Connected" : "Not connected")
          Text(remote ? "DIRECTOR" : "CAM \(cam)").font(.title2.bold())
          Image(systemName: "chevron.down").font(.footnote.bold()).foregroundStyle(.secondary)
        }
        .padding(.horizontal, 20).padding(.vertical, 12)
      }
      .buttonStyle(.plain)
      .accessibilityLabel(remote ? "Director remote, change view" : "Camera \(cam), change camera")
      .glassEffect(.clear.interactive(), in: .capsule) // untinted, so the shot rows read through as they scroll under
      Spacer(minLength: 8)
      // controls float as their own glass group on the right
      HStack(spacing: 4) {
        if !remote {
          Button { pips.toggle() } label: { Image(systemName: pips ? "speaker.wave.2" : "speaker.slash").frame(width: 44, height: 44) }
            .accessibilityLabel(pips ? "Mute countdown pips" : "Unmute countdown pips")
          Button { waterfall.toggle() } label: { Image(systemName: waterfall ? "rectangle.grid.1x2" : "chart.bar.xaxis").frame(width: 44, height: 44) }
            .accessibilityLabel(waterfall ? "Show cards" : "Show waterfall")
        }
        Button { settings = true } label: { Image(systemName: "gearshape").frame(width: 44, height: 44) }
          .accessibilityLabel("Settings")
      }
      .font(.title3).buttonStyle(.plain)
      .padding(4)
      .glassEffect(.clear.interactive(), in: .capsule)
    }
  }

  private func hero(_ p: Plan, color: Color) -> some View {
    let (label, tint): (String, Color) = p.onAir ? ("ON AIR", .red) : p.standby ? ("STANDBY", .green) : p.next != nil ? ("NEXT CUT", color) : ("CLEAR", .gray)
    let shot = p.onAir ? p.live : p.next
    return VStack(spacing: 6) {
      Text(label).font(.headline.weight(.heavy)).tracking(2)
      Text(p.left.map { String(format: "%.1f", max(0, $0)) } ?? "–")
        .font(.system(size: 96, weight: .bold, design: .rounded).monospacedDigit())
      Text(shot?.note.isEmpty == false ? shot!.note : " ").font(.title3).multilineTextAlignment(.center)
    }
    .frame(maxWidth: .infinity).padding(24)
    .glassEffect(.regular.tint(tint.opacity(p.onAir || p.standby ? 0.6 : 0.25)), in: .rect(cornerRadius: 32))
  }

  private func shotRow(_ s: Plan.Shot, now: Double, cams: [Cam], live: Bool) -> some View {
    let c = cams.first { $0.id == s.cam }
    return HStack(spacing: 12) {
      Text("\(s.no)").font(.caption.monospacedDigit()).foregroundStyle(.secondary).frame(width: 28)
      RoundedRectangle(cornerRadius: 4).fill(Color(hex: c?.color)).frame(width: 6)
      VStack(alignment: .leading, spacing: 2) {
        Text("CAM \(s.cam) · \(c?.name ?? "")").font(.subheadline.bold()).lineLimit(1)
        if !s.note.isEmpty { Text(s.note).font(.subheadline).foregroundStyle(.secondary).lineLimit(2) }
      }
      Spacer()
      VStack(alignment: .trailing, spacing: 2) {
        Text(live ? "LIVE" : "in \(dur(s.start - now))").font(.subheadline.monospacedDigit().bold())
        Text(dur(s.end - s.start) + (s.gap.map { " · \(dur($0)) reset" } ?? "")).font(.caption.monospacedDigit()).foregroundStyle(.secondary)
      }
    }
    .padding(12)
    .glassEffect(live ? .regular.tint(.red.opacity(0.4)) : .regular, in: .rect(cornerRadius: 18))
  }

  private func section(_ t: String) -> some View {
    Text(t.uppercased()).font(.caption.bold()).foregroundStyle(.secondary).padding(.top, 8)
  }
}
