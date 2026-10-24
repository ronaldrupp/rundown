import SwiftUI
import AVFoundation

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
