import SwiftUI

@main struct CamOpApp: App {
  init() {
    UIApplication.shared.isIdleTimerDisabled = true // operators watch this for a whole show
    #if DEBUG
    Plan.selfCheck()
    #endif
  }
  var body: some Scene { WindowGroup { CamView().preferredColorScheme(.dark) } }
}

// What this camera needs at time `now`, mirroring src/CamView.vue
struct Plan {
  struct Shot: Identifiable { let id: Int; let no: Int; let cam: Int; let start, end: Double; let note: String; var gap: Double? }
  let all: [Shot], live: Shot?, own: [Shot], mine: [Shot], onAir: Bool, next: Shot?, standby: Bool, left: Double?

  init(show: Show, cam: Int, now: Double) {
    let s = show.cues.sorted { $0.start < $1.start }
    all = s.enumerated().map { i, c in
      Shot(id: c.id, no: i + 1, cam: c.cam, start: c.start, end: i + 1 < s.count ? s[i + 1].start : show.duration, note: c.note ?? "")
    }
    let liveIdx = all.lastIndex { $0.start <= now }
    let all = all, live = liveIdx.map { all[$0] }
    self.live = live
    var own = all.filter { $0.cam == cam }
    for i in own.indices.dropFirst() { own[i].gap = own[i].start - own[i - 1].end } // time to reposition
    self.own = own
    let mine = own.filter { $0.end > now }, onAir = live?.cam == cam, next = mine.first { $0.start > now }
    (self.mine, self.onAir, self.next) = (mine, onAir, next)
    standby = !onAir && next != nil && next?.no == (liveIdx ?? -1) + 2
    left = onAir ? live.map { $0.end - now } : next.map { $0.start - now }
  }

  static func selfCheck() {
    let show = Show(title: nil, duration: 30, cams: [], cues: [Cue(id: 2, start: 10, cam: 2, note: nil), Cue(id: 1, start: 0, cam: 1, note: "A"), Cue(id: 3, start: 20, cam: 1, note: nil)])
    let p = Plan(show: show, cam: 1, now: 5)
    assert(p.onAir && p.left == 5 && p.next?.start == 20 && p.mine.last?.gap == 10)
    let q = Plan(show: show, cam: 1, now: 12)
    assert(!q.onAir && q.standby && q.left == 8)
  }
}
