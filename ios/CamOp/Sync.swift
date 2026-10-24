import Foundation
import Observation

struct Cam: Decodable, Identifiable { let id: Int; let name: String; let color: String }
struct Cue: Decodable { let id: Int; let start: Double; let cam: Int; let note: String? }
struct Show: Decodable {
  let title: String?; let duration: Double; let cams: [Cam]; let cues: [Cue]
  var bpm: Double? = nil, beatsPerBar: Double? = nil
  var bar: Double { 60 / (bpm ?? 120) * (beatsPerBar ?? 4) }
}

// Follows the director over the Vite dev server's websocket, same protocol as src/sync.js follow().
// A native client sends no Origin header, so Vite lets it in without the page's websocket token.
@MainActor @Observable final class Sync {
  var show: Show?
  var playing = false
  var last = Date.distantPast // when the director's clock last arrived
  private var base = 0.0
  private var baseAt = Date()
  @ObservationIgnored private var leader: String?
  @ObservationIgnored private var leaderPlaying = false
  @ObservationIgnored private var task: URLSessionWebSocketTask?

  // show time at `date`, run forward locally between the director's 100ms clock messages
  func time(at date: Date) -> Double {
    playing ? min(base + date.timeIntervalSince(baseAt), show?.duration ?? .infinity) : base
  }
  func connected(at date: Date) -> Bool { date.timeIntervalSince(last) < 1.5 }

  // runs until cancelled, reconnecting every second while the server is unreachable
  func run(host: String) async {
    guard let url = URL(string: "ws://\(host)/") else { return }
    while !Task.isCancelled {
      let t = URLSession.shared.webSocketTask(with: url, protocols: ["vite-hmr"])
      task = t; leader = nil
      t.resume()
      hello()
      await withTaskCancellationHandler {
        while let msg = try? await t.receive() { if case .string(let s) = msg { handle(Data(s.utf8)) } }
      } onCancel: { t.cancel() }
      t.cancel()
      try? await Task.sleep(for: .seconds(1))
    }
  }

  private func hello() { task?.send(.string(#"{"type":"custom","event":"rundown:hello"}"#)) { _ in } }

  // director remote: the director window runs play/pause/seek (src/sync.js publish())
  func control(_ cmd: String, t: Double? = nil) {
    let data = t.map { #"{"cmd":"\#(cmd)","t":\#($0)}"# } ?? #"{"cmd":"\#(cmd)"}"#
    task?.send(.string(#"{"type":"custom","event":"rundown:control","data":\#(data)}"#)) { _ in }
  }

  private struct Event: Decodable { let event: String? }
  private struct Msg<T: Decodable>: Decodable { let data: T }
  private struct ShowMsg: Decodable { let id: String; let show: Show }
  private struct ClockMsg: Decodable { let id: String; let now: Double; let playing: Bool }

  private func handle(_ d: Data) {
    let dec = JSONDecoder()
    switch (try? dec.decode(Event.self, from: d))?.event {
    case "rundown:show":
      guard let m = try? dec.decode(Msg<ShowMsg>.self, from: d).data, leader == nil || m.id == leader else { return }
      show = m.show
    case "rundown:clock":
      guard let c = try? dec.decode(Msg<ClockMsg>.self, from: d).data else { return }
      let t = Date()
      // stick with one director; switch only if it went silent or a newcomer plays while it is paused
      if c.id != leader {
        if leader != nil, t.timeIntervalSince(last) < 1.5, !(c.playing && !leaderPlaying) { return }
        leader = c.id
        hello() // ask for the rundown; only the new leader's copy is accepted
      }
      // glide toward the director's time while playing; jump on seeks. Wi-Fi delivers late, never early,
      // so catch up fast but back off slowly, or every delayed burst yanks the clock back
      let drift = c.now - time(at: t)
      base = c.playing && playing && abs(drift) < 0.5 ? time(at: t) + drift * (drift > 0 ? 0.5 : 0.05) : c.now
      baseAt = t
      last = t; leaderPlaying = c.playing; playing = c.playing
    default: break
    }
  }
}
