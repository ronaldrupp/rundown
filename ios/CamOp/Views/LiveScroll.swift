import SwiftUI

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
