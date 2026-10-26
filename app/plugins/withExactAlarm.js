const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

/**
 * SCHEDULE_EXACT_ALARM för laga-lägets timrar.
 *
 * expo-notifications schemalägger med setExactAndAllowWhileIdle om appen får
 * ställa exakta larm, annars med setAndAllowWhileIdle — och då levererar
 * Android när det passar, ibland minuter för sent. Med appen stängd är
 * notisen enda larmet, så en timer för pastan måste komma i tid.
 *
 * Android 12–13 beviljar behörigheten direkt. Från Android 14 är den avstängd
 * från början och slås på under "Alarm och påminnelser" — laga-läget tipsar en
 * gång. USE_EXACT_ALARM (beviljas automatiskt) används INTE: Play godkänner
 * den bara för appar vars huvudsyfte är väckarklocka eller kalender.
 *
 * Läggs i manifestet med en plugin i stället för android.permissions i
 * app.json: en sådan lista ersätter Expos standardbehörigheter.
 */
module.exports = function withExactAlarm(config) {
  return withAndroidManifest(config, (cfg) => {
    AndroidConfig.Permissions.ensurePermissions(cfg.modResults, ['android.permission.SCHEDULE_EXACT_ALARM']);
    return cfg;
  });
};
