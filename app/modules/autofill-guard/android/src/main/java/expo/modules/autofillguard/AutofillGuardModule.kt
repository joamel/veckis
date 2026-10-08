package expo.modules.autofillguard

import android.os.Build
import android.view.View
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Stänger av autofyll (Samsung Pass, Googles autofyll) i det FÖNSTER en vy
// ligger i. withDisableAutofill sätter samma flagga på huvudaktiviteten, men
// en React Native-<Modal> ritas i ett eget dialogfönster utanför den — där
// föreslog Samsung Pass inloggningsuppgifter i t.ex. receptlänkens fält.
class AutofillGuardModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AutofillGuard")

    AsyncFunction("excludeWindowOf") { viewTag: Int ->
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return@AsyncFunction false
      val view = appContext.findView<View>(viewTag) ?: return@AsyncFunction false
      view.rootView.importantForAutofill = View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS
      true
    }.runOnQueue(Queues.MAIN)
  }
}
