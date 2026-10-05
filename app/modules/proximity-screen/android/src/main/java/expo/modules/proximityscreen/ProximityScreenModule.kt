package expo.modules.proximityscreen

import android.content.Context
import android.os.PowerManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// PROXIMITY_SCREEN_OFF_WAKE_LOCK: så länge låset hålls släcker systemet
// skärmen när sensorn är täckt och tänder den när den blir fri — samma som
// under ett samtal. Ingen timeout: låset släpps uttryckligen från JS när
// "Jag handlar" slutar eller appen hamnar i bakgrunden.
class ProximityScreenModule : Module() {
  private var wakeLock: PowerManager.WakeLock? = null

  private val powerManager: PowerManager?
    get() = appContext.reactContext?.getSystemService(Context.POWER_SERVICE) as? PowerManager

  override fun definition() = ModuleDefinition {
    Name("ProximityScreen")

    AsyncFunction("isAvailable") {
      powerManager?.isWakeLockLevelSupported(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK) == true
    }

    AsyncFunction("setEnabled") { enabled: Boolean ->
      if (enabled) acquire() else release()
    }

    OnDestroy { release() }
  }

  private fun acquire() {
    if (wakeLock?.isHeld == true) return
    val pm = powerManager ?: return
    if (!pm.isWakeLockLevelSupported(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK)) return
    wakeLock = pm.newWakeLock(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK, "handlis:proximity").apply {
      setReferenceCounted(false)
      acquire()
    }
  }

  private fun release() {
    // WAIT_FOR_NO_PROXIMITY: släpps låset medan mobilen ligger i fickan tänds
    // skärmen inte förrän sensorn blir fri — annars tänds den i fickan.
    wakeLock?.let { if (it.isHeld) it.release(PowerManager.RELEASE_FLAG_WAIT_FOR_NO_PROXIMITY) }
    wakeLock = null
  }
}
