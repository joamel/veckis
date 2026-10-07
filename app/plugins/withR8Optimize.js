const { withAppBuildGradle, withGradleProperties } = require('expo/config-plugins');

/**
 * Slå på R8:s optimering, inte bara krympning/fördunkling.
 *
 * Expos mall pekar release-bygget på `proguard-android.txt`, som innehåller
 * `-dontoptimize` — Play Console klagar då på "Optimering har inte aktiverats".
 * `proguard-android-optimize.txt` är samma regler utan den raden. Dessutom
 * optimerad resurskrympning (AGP 8.6+; RN 0.81 har 8.11), som krymper resurser
 * och kod i ett pass.
 *
 * Kräver att minify/shrinkResources redan är på (expo-build-properties).
 * Risk som för R8 i övrigt: reflektion som optimeringen inte ser → krasch i körning.
 */
module.exports = function withR8Optimize(config) {
  config = withAppBuildGradle(config, (cfg) => {
    cfg.modResults.contents = cfg.modResults.contents.replace(
      'getDefaultProguardFile("proguard-android.txt")',
      'getDefaultProguardFile("proguard-android-optimize.txt")',
    );
    return cfg;
  });
  return withGradleProperties(config, (cfg) => {
    const key = 'android.r8.optimizedResourceShrinking';
    cfg.modResults = cfg.modResults.filter((p) => !(p.type === 'property' && p.key === key));
    cfg.modResults.push({ type: 'property', key, value: 'true' });
    return cfg;
  });
};
