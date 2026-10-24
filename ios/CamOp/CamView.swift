import SwiftUI

struct CamView: View {
  @State private var sync = Sync()
  @AppStorage("host") private var host = "localhost:5173"
  @AppStorage("cam") private var cam = 1
  @AppStorage("waterfall") private var waterfall = true
  @AppStorage("remote") private var remote = false // director remote instead of a camera
  @State private var settings = false

  var body: some View {
    TimelineView(.animation) { ctx in
      let now = sync.time(at: ctx.date)
      let cams = sync.show?.cams ?? []
      let me = cams.first { $0.id == cam }
      let color = Color(hex: me?.color)
      ZStack {
        LinearGradient(colors: [color.opacity(0.35), .black], startPoint: .top, endPoint: .bottom).ignoresSafeArea()
        GlassEffectContainer(spacing: 16) {
          VStack(spacing: 16) {
            header(me: me, color: color, connected: sync.connected(at: ctx.date), now: now)
            if let show = sync.show {
              let plan = Plan(show: show, cam: cam, now: now)
              if remote {
                DirectorRemote(show: show, sync: sync, now: now)
              } else if waterfall {
                Waterfall(plan: plan, cams: cams, cam: cam, color: color, now: now)
              } else {
              hero(plan, color: color)
              LiveScroll(spacing: 10) {
                section("Your shots")
                ForEach(plan.mine) { shotRow($0, now: now, cams: cams, live: $0.id == plan.live?.id) }
                if plan.mine.isEmpty { Text("No more shots").foregroundStyle(.secondary) }
                section("Shot flow")
                ForEach(plan.all.filter { $0.end > now }) { shotRow($0, now: now, cams: cams, live: $0.id == plan.live?.id) }
              }
              }
            } else {
              ContentUnavailableView("Waiting for the director", systemImage: "antenna.radiowaves.left.and.right",
                                     description: Text("Start the director view on \(host)"))
            }
          }
          .padding()
        }
        // tally frame like the web view: follows the display's rounded corners, a soft glow fading inward
        let onAir = !remote && sync.show.map { Plan(show: $0, cam: cam, now: now).onAir } ?? false
        TallyFrame().opacity(onAir ? 1 : 0) // no fade: it must show the instant the cut happens
      }
    }
    .task(id: host) { await sync.run(host: host) }
    .sheet(isPresented: $settings) { SettingsSheet(host: $host, cam: $cam, remote: $remote, cams: sync.show?.cams ?? []) }
  }

  private func header(me: Cam?, color: Color, connected: Bool, now: Double) -> some View {
    HStack {
      Text(remote ? "DIRECTOR" : "CAM \(cam)").font(.title2.bold())
      Text((remote ? sync.show?.title : me?.name) ?? "").font(.headline).foregroundStyle(.secondary).lineLimit(1)
      Spacer()
      Text(clock(now)).font(.headline.monospacedDigit())
      Circle().fill(connected ? .green : .red).frame(width: 10, height: 10)
        .accessibilityLabel(connected ? "Connected" : "Not connected")
      if !remote {
        Button { waterfall.toggle() } label: { Image(systemName: waterfall ? "rectangle.grid.1x2" : "chart.bar.xaxis") }
          .buttonStyle(.glass)
          .accessibilityLabel(waterfall ? "Show cards" : "Show waterfall")
      }
      Button { settings = true } label: { Image(systemName: "gearshape") }
        .buttonStyle(.glass)
        .accessibilityLabel("Settings")
    }
    .padding(.horizontal, 20).padding(.vertical, 12)
    .glassEffect(.regular.tint(remote ? .clear : color.opacity(0.4)), in: .capsule)
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
  private func dur(_ d: Double) -> String { d < 10 ? String(format: "%.1fs", d) : "\(Int(d.rounded()))s" }
  private func clock(_ t: Double) -> String { String(format: "%d:%02d", Int(t) / 60, Int(t) % 60) }
}

// stroke is centred on the shape, so the outer half of each width falls off the display
struct TallyFrame: View {
  var body: some View {
    ZStack {
      ConcentricRectangle().stroke(.red.opacity(0.7), lineWidth: 20).blur(radius: 7)
      ConcentricRectangle().stroke(.red, lineWidth: 8).blur(radius: 1.5)
    }
    .ignoresSafeArea().allowsHitTesting(false)
  }
}

// The web cam view's waterfall (src/CamView.vue): each shot's bar slides in from the right across a
// 16 second window, the whole cut flow on top, a countdown band, then this camera's own shots.
struct Waterfall: View {
  let plan: Plan, cams: [Cam], cam: Int, color: Color, now: Double
  private let window = 16.0

  var body: some View {
    VStack(spacing: 8) {
      LiveScroll(spacing: 3) { ForEach(plan.all.filter { $0.end > now }) { ShotRow(s: $0, cams: cams, now: now, live: $0.id == plan.live?.id, outlined: $0.cam == cam) } }
        .frame(maxHeight: .infinity)
      band
      LiveScroll(spacing: 3) {
        ForEach(plan.mine) { ShotRow(s: $0, cams: cams, now: now, live: $0.id == plan.live?.id, showGap: true) }
        if plan.mine.isEmpty { Text("No more shots for camera \(cam).").foregroundStyle(.secondary).padding() }
      }
      .frame(maxHeight: .infinity)
    }
  }

  private var band: some View {
    let tint: Color = plan.onAir ? .red : plan.standby ? .green : .clear
    return HStack(spacing: 12) {
      Text("\(cam)").font(.title2.weight(.heavy)).frame(width: 52, height: 44).background(color, in: .rect(cornerRadius: 12))
      Text(plan.left.map { "\(Int(max(0, $0).rounded(.up)))" } ?? "–").font(.title.weight(.heavy).monospacedDigit()).frame(width: 56)
      GeometryReader { g in
        Rectangle().fill(plan.standby ? .black : .white).frame(width: g.size.width * min(plan.left ?? 0, window) / window)
      }
      .frame(height: 26)
      Text(plan.onAir ? "ON AIR" : plan.standby ? "STANDBY" : plan.next != nil ? "NEXT IN" : "DONE")
        .font(.footnote.weight(.heavy)).tracking(1)
    }
    .foregroundStyle(plan.standby ? .black : .white)
    .padding(8)
    .glassEffect(.regular.tint(tint.opacity(0.8)), in: .rect(cornerRadius: 18))
  }
}

// One waterfall row: the shot's bar slides in from the right across a 16 second window
struct ShotRow: View {
  let s: Plan.Shot, cams: [Cam], now: Double, live: Bool
  var outlined = false, showGap = false
  private let window = 16.0

  var body: some View {
    let c = cams.first { $0.id == s.cam }
    HStack(spacing: 0) {
      Text("\(s.no)").font(.subheadline.monospacedDigit()).foregroundStyle(.secondary).frame(width: 36, alignment: .trailing).padding(.trailing, 8)
      Text("\(s.cam)").font(.title2.bold()).frame(width: 52).frame(maxHeight: .infinity).background(Color(hex: c?.color))
      ZStack(alignment: .leading) {
        GeometryReader { g in
          Rectangle().fill(Color(hex: c?.color).opacity(0.55))
            .frame(width: g.size.width * max(0, s.end - max(s.start, now)) / window)
            .offset(x: g.size.width * max(0, s.start - now) / window)
        }
        VStack(alignment: .leading, spacing: 1) {
          HStack(spacing: 24) {
            Text(dur(s.end - s.start))
            if let gap = s.gap, showGap { Text("+\(Int(gap.rounded()))s").foregroundStyle(.tertiary) }
          }
          .font(.caption.monospacedDigit()).foregroundStyle(.secondary)
          Text((s.note.isEmpty ? c?.name ?? "" : s.note).uppercased()).font(.subheadline.weight(live ? .bold : .regular)).lineLimit(1)
        }
        .padding(.horizontal, 8)
      }
      .clipped()
    }
    .frame(height: 50)
    .background(.white.opacity(0.07))
    .clipShape(.rect(cornerRadius: 10))
    .overlay { if outlined { RoundedRectangle(cornerRadius: 10).strokeBorder(.white.opacity(0.35), lineWidth: 2) } }
  }
  private func dur(_ d: Double) -> String { d < 10 ? String(format: "%.1fs", d) : "\(Int(d.rounded()))s" }
}

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
      LiveScroll(spacing: 3) {
        ForEach(plan.all.filter { $0.end > now }) { s in
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

// Shot list that starts at the live shot; scroll ahead freely, "Back to live" returns to the top
struct LiveScroll<Content: View>: View {
  var spacing: CGFloat
  @ViewBuilder var content: Content
  @State private var position = ScrollPosition(edge: .top)
  @State private var away = false

  var body: some View {
    ScrollView { VStack(alignment: .leading, spacing: spacing) { content } }
      .scrollIndicators(.hidden)
      .scrollPosition($position)
      .onScrollGeometryChange(for: Bool.self) { $0.contentOffset.y + $0.contentInsets.top > 8 } action: { away = $1 }
      .overlay(alignment: .bottom) {
        if away {
          Button("Back to live", systemImage: "arrow.up.to.line") { withAnimation { position.scrollTo(edge: .top) } }
            .buttonStyle(.glassProminent).tint(.red).padding(8)
        }
      }
  }
}

struct SettingsSheet: View {
  @Binding var host: String
  @Binding var cam: Int
  @Binding var remote: Bool
  let cams: [Cam]
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
        if !remote { Section("Camera") {
          Picker("Camera", selection: $cam) {
            ForEach(cams.isEmpty ? [Cam(id: cam, name: "", color: "")] : cams) { Text("CAM \($0.id)  \($0.name)").tag($0.id) }
          }
          .pickerStyle(.inline).labelsHidden()
        } }
      }
      .navigationTitle("Settings")
      .toolbar { Button("Done") { host = draft.trimmingCharacters(in: .whitespaces); dismiss() } }
    }
    .onAppear { draft = host }
  }
}

extension Color {
  init(hex: String?) {
    let v = UInt64((hex ?? "").dropFirst(), radix: 16) ?? 0x8e8e93
    self.init(red: Double(v >> 16 & 0xff) / 255, green: Double(v >> 8 & 0xff) / 255, blue: Double(v & 0xff) / 255)
  }
}
