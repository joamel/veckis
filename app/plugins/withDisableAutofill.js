const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Disable Android autofill for the app's view tree by marking the main activity
 * as `noExcludeDescendants`. Stops Samsung Pass / Google autofill from offering
 * "id/password" suggestions on empty text fields (e.g. new recipe-ingredient
 * rows) where the per-field importantForAutofill="no" isn't honoured.
 *
 * Trade-off: password managers won't auto-fill the in-app sign-in/sign-up fields
 * either. Remove this plugin from app.json (and rebuild) to restore that.
 */
module.exports = function withDisableAutofill(config) {
  return withAndroidManifest(config, (cfg) => {
    const application = cfg.modResults.manifest.application?.[0];
    const activities = (application && application.activity) || [];
    for (const activity of activities) {
      const isMain = ((activity['intent-filter'] || []).some((f) =>
        (f.action || []).some((a) => a.$ && a.$['android:name'] === 'android.intent.action.MAIN'),
      ));
      if (isMain && activity.$) {
        activity.$['android:importantForAutofill'] = 'noExcludeDescendants';
      }
    }
    return cfg;
  });
};
