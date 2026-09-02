const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Tvinga MainActivity till launchMode="singleTask".
 *
 * Native Google-OAuth (clerk-expo useSSO) öppnar systembrowsern och väntar på att
 * Clerks redirect (`handlis://…`) ska återvända till Custom Tab-sessionen. Utan
 * singleTask öppnar Android redirekten i en NY task → `startSSOFlow` får 'dismiss'
 * utan session, och sessionen skapas i stället på en browser-client som native-
 * appen aldrig adopterar → utloggad vid omstart. singleTask gör att redirekten
 * återanvänder MainActivity (onNewIntent) → openAuthSessionAsync fångar den →
 * sessionen skapas på native-clienten (persisteras som e-postlogin).
 */
module.exports = function withSingleTask(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application && cfg.modResults.manifest.application[0];
    const activities = (app && app.activity) || [];
    const main = activities.find((a) => a.$ && a.$['android:name'] === '.MainActivity');
    if (main && main.$) {
      main.$['android:launchMode'] = 'singleTask';
    }
    return cfg;
  });
};
