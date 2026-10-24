import Foundation
import Observation

struct Cam: Decodable, Identifiable { let id: Int; let name: String; let color: String }
struct Cue: Decodable { let id: Int; let start: Double; let cam: Int; let note: String? }
struct Show: Decodable {
  let title: String?; let duration: Double; let cams: [Cam]; let cues: [Cue]
  var bpm: Double? = nil, beatsPerBar: Double? = nil
  var bar: Double { 60 / (bpm ?? 120) * (beatsPerBar ?? 4) }
}

// Follows the director over the rundown server's websocket (server/index.js), same protocol as src/sync.js follow().
// Cameras join with the director's code; the director remote signs in and connects with its login token.
@MainActor @Observable final class Sync {
  var show: Show?
  var playing = false
  var last = Date.distantPast // when the director's clock last arrived
  var denied = false // the server refused the join code or token
  private var base = 0.0
  private var baseAt = Date()
  @ObservationIgnored private var offset = 0.0 // server time minus local time, seconds
  @ObservationIgnored private var bestRtt = Double.infinity
  @ObservationIgnored private var leader: String?
  @ObservationIgnored private var leaderPlaying = false
  @ObservationIgnored private var task: URLSessionWebSocketTask?

  // show time at `date`, run forward locally between the director's 100ms clock messages
  func time(at date: Date) -> Double {
    playing ? min(base + date.timeIntervalSince(baseAt), show?.duration ?? .infinity) : base
  }
  func connected(at date: Date) -> Bool { date.timeIntervalSince(last) < 1.5 }

  // "rundown.example.com" or "https://…" -> https, a bare LAN address like "192.168.1.10:5173" -> http
  static func base(_ host: String) -> URL? {
    URL(string: host.contains("://") ? host : (host.contains(".") && !host.contains(":") ? "https://" : "http://") + host)
  }

  // signs in as the director and returns the login token the remote connects with
  static func login(host: String, email: String, password: String) async throws -> String {
    guard let url = base(host)?.appending(path: "api/login") else { throw URLError(.badURL) }
    var req = URLRequest(url: url)
    req.httpMethod = "POST"
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.httpBody = try JSONEncoder().encode(["email": email, "password": password])
    let (data, res) = try await URLSession.shared.data(for: req)
    struct Reply: Decodable { let token: String?; let error: String? }
    let r = try JSONDecoder().decode(Reply.self, from: data)
    guard (res as? HTTPURLResponse)?.statusCode == 200, let token = r.token else {
      throw NSError(domain: "Rundown", code: 1, userInfo: [NSLocalizedDescriptionKey: r.error ?? "Sign-in failed"])
    }
    return token
  }

  // runs until cancelled, reconnecting every second while the server is unreachable.
  // query: code=<join code> for a camera, token=<login token>&role=remote for the director remote
  func run(host: String, query: String) async {
    guard let b = Self.base(host), var c = URLComponents(url: b.appending(path: "ws"), resolvingAgainstBaseURL: false) else { return }
    c.scheme = c.scheme == "https" ? "wss" : "ws"
    c.percentEncodedQuery = query
    guard let url = c.url else { return }
    denied = false; show = nil
    while !Task.isCancelled {
      let t = URLSession.shared.webSocketTask(with: url)
      task = t; leader = nil; bestRtt = .infinity
      t.resume()
      hello()
      ping()
      // probe the server clock every 2s so countdowns can make up for network delay
      let pinger = Task { while !Task.isCancelled { try? await Task.sleep(for: .seconds(2)); ping() } }
      await withTaskCancellationHandler {
        while let msg = try? await t.receive() { if case .string(let s) = msg { handle(Data(s.utf8)) } }
      } onCancel: { t.cancel() }
      pinger.cancel()
      t.cancel()
      if t.closeCode.rawValue == 4001 { denied = true; return } // wrong code or expired login: retrying won't help
      try? await Task.sleep(for: .seconds(1))
    }
  }

  private func send(_ event: String, _ data: String = "null") { task?.send(.string(#"{"event":"\#(event)","data":\#(data)}"#)) { _ in } }
  private func hello() { send("rundown:hello") }
  private func ping() { send("ping", #"{"t":\#(Date().timeIntervalSince1970 * 1000)}"#) }

  // director remote: the director window runs play/pause/seek (src/sync.js publish())
  func control(_ cmd: String, t: Double? = nil) {
    send("rundown:control", t.map { #"{"cmd":"\#(cmd)","t":\#($0)}"# } ?? #"{"cmd":"\#(cmd)"}"#)
  }

  private struct Event: Decodable { let event: String? }
  private struct Msg<T: Decodable>: Decodable { let data: T }
  private struct ShowMsg: Decodable { let id: String; let show: Show }
  private struct ClockMsg: Decodable { let id: String; let now: Double; let playing: Bool; let at: Double? }
  private struct Pong: Decodable { let t: Double; let s: Double }

  private func handle(_ d: Data) {
    let dec = JSONDecoder()
    switch (try? dec.decode(Event.self, from: d))?.event {
    case "pong":
      guard let p = try? dec.decode(Msg<Pong>.self, from: d).data else { return }
      let local = Date().timeIntervalSince1970 * 1000, rtt = local - p.t
      if rtt < bestRtt { bestRtt = rtt; offset = (p.s + rtt / 2 - local) / 1000 }
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
      // add the network delay: `at` is when the director read its clock, in server time (ms)
      let delay = c.playing ? c.at.map { max(0, t.timeIntervalSince1970 + offset - $0 / 1000) } ?? 0 : 0
      let now = min(c.now + delay, show?.duration ?? .infinity)
      let drift = now - time(at: t)
      base = c.playing && playing && abs(drift) < 0.5 ? time(at: t) + drift * (drift > 0 ? 0.5 : 0.05) : now
      baseAt = t
      last = t; leaderPlaying = c.playing; playing = c.playing
    default: break
    }
  }
}
