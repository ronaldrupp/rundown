import SwiftUI

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
