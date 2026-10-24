import SwiftUI
import AVFoundation

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
  private func dur(_ d: Double) -> String { d < 10 ? String(format: "%.1fs", d) : "\(Int(d.rounded()))s" }
}

// stroke is centred on the shape, so the outer half of each width falls off the display
struct TallyFrame: View {
  let color: Color
  var body: some View {
    ZStack {
      ConcentricRectangle().stroke(color.opacity(0.7), lineWidth: 20).blur(radius: 7)
      ConcentricRectangle().stroke(color, lineWidth: 8).blur(radius: 1.5)
    }
    .ignoresSafeArea().allowsHitTesting(false)
  }
}

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
  private func dur(_ d: Double) -> String { d < 10 ? String(format: "%.1fs", d) : "\(Int(d.rounded()))s" }
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

// Shot list that keeps the live row at the top; scroll back or ahead freely, "Back to live" resumes following
struct LiveScroll<Content: View>: View {
  var spacing: CGFloat
  var live: Int? = nil // id of the row to follow; nil follows the top
  @ViewBuilder var content: Content
  @State private var away = false

  var body: some View {
    // ScrollViewReader: ScrollPosition.scrollTo(id:anchor: .top) left the live row low in the list
    ScrollViewReader { proxy in
      ScrollView {
        VStack(alignment: .leading, spacing: spacing) {
          Color.clear.frame(height: 0).id(Self.top)
          content
        }
      }
      .scrollIndicators(.hidden)
      .onScrollPhaseChange { _, phase in if phase == .interacting { away = true } }
      .onChange(of: live, initial: true) { if !away { withAnimation(.smooth(duration: 0.25)) { follow(proxy) } } }
      // re-align when the list resizes (first layout, dragging the split)
      .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { _ in if !away { follow(proxy) } }
      .overlay(alignment: .bottom) {
        if away {
          Button("Back to live", systemImage: "dot.radiowaves.left.and.right") { away = false; withAnimation { follow(proxy) } }
            .buttonStyle(.glassProminent).tint(.red).padding(8)
        }
      }
    }
  }

  private static var top: Int { Int.min }
  private func follow(_ proxy: ScrollViewProxy) { proxy.scrollTo(live ?? Self.top, anchor: .top) }
}

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

extension Color {
  init(hex: String?) {
    let v = UInt64((hex ?? "").dropFirst(), radix: 16) ?? 0x8e8e93
    self.init(red: Double(v >> 16 & 0xff) / 255, green: Double(v >> 8 & 0xff) / 255, blue: Double(v & 0xff) / 255)
  }
}

// Countdown pips and haptics, same as the web cam view's speaker toggle: short at 3, 2, 1, long at the cut.
// Plays through the silent switch, mixed with whatever else is playing.
@MainActor final class Pips {
  private let engine = AVAudioEngine(), player = AVAudioPlayerNode()
  private let format = AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 1)!

  init() {
    engine.attach(player)
    engine.connect(player, to: engine.mainMixerNode, format: format)
  }

  func pip(_ freq: Double, ms: Double) {
    let n = AVAudioFrameCount(44100 * ms / 1000), ramp = 0.005 * 44100
    guard let buf = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: n) else { return }
    buf.frameLength = n
    for i in 0..<Int(n) {
      let edge = min(Double(i), Double(Int(n) - i)) / ramp // short ramps avoid clicks
      buf.floatChannelData![0][i] = Float(0.5 * min(1, edge) * sin(2 * .pi * freq * Double(i) / 44100))
    }
    try? AVAudioSession.sharedInstance().setCategory(.playback, options: .mixWithOthers)
    try? AVAudioSession.sharedInstance().setActive(true)
    if !engine.isRunning { try? engine.start() }
    player.play()
    player.scheduleBuffer(buf)
    UIImpactFeedbackGenerator(style: ms > 200 ? .heavy : .light).impactOccurred()
  }
}
