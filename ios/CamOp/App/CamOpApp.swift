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
