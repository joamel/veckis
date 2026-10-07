const { withAndroidManifest } = require('expo/config-plugins');

const SCANNER_ACTIVITY = 'com.google.mlkit.vision.codescanner.internal.GmsBarcodeScanningDelegateActivity';

/**
 * Ta bort porträttlåset på Googles streckkodsläsare.
 *
 * Aktiviteten följer med `play-services-code-scanner`, som expo-dev-launcher
 * (via expo-dev-client) drar in även i release-bygget. Appen använder den inte,
 * men Play Console flaggar låset: från Android 16 ignoreras det ändå på stora
 * skärmar. `tools:replace` skriver över bibliotekets värde vid manifestsammanslagningen.
 */
module.exports = function withUnlockScannerOrientation(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest.$['xmlns:tools'] = manifest.$['xmlns:tools'] || 'http://schemas.android.com/tools';
    const app = manifest.application[0];
    app.activity = (app.activity || []).filter((a) => a.$['android:name'] !== SCANNER_ACTIVITY);
    app.activity.push({
      $: {
        'android:name': SCANNER_ACTIVITY,
        'android:screenOrientation': 'unspecified',
        'tools:replace': 'android:screenOrientation',
      },
    });
    return cfg;
  });
};
