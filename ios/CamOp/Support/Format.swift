import SwiftUI

extension Color {
  init(hex: String?) {
    let v = UInt64((hex ?? "").dropFirst(), radix: 16) ?? 0x8e8e93
    self.init(red: Double(v >> 16 & 0xff) / 255, green: Double(v >> 8 & 0xff) / 255, blue: Double(v & 0xff) / 255)
  }
}

// shot lengths and countdowns: tenths under 10s, whole seconds above
func dur(_ d: Double) -> String { d < 10 ? String(format: "%.1fs", d) : "\(Int(d.rounded()))s" }
