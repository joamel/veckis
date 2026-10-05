import ExpoModulesCore
import UIKit

// UIDevice måste röras på huvudtråden, därav runOnQueue(.main).
public class ProximityScreenModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ProximityScreen")

    // iOS har inget "finns sensorn?"-API: slå på och läs tillbaka. Enheter
    // utan sensor vägrar och värdet förblir false.
    AsyncFunction("isAvailable") { () -> Bool in
      let device = UIDevice.current
      let was = device.isProximityMonitoringEnabled
      device.isProximityMonitoringEnabled = true
      let available = device.isProximityMonitoringEnabled
      device.isProximityMonitoringEnabled = was
      return available
    }.runOnQueue(.main)

    AsyncFunction("setEnabled") { (enabled: Bool) in
      UIDevice.current.isProximityMonitoringEnabled = enabled
    }.runOnQueue(.main)

    OnDestroy {
      DispatchQueue.main.async {
        UIDevice.current.isProximityMonitoringEnabled = false
      }
    }
  }
}
