// Feature-flaggor för reversibla experiment. Kompileringstids-konstanter, INTE
// användar-toggles — de finns för att vi enkelt ska kunna känna på och backa
// en riktning utan att riva kod.
//
// EXPERIMENT: "recept-fokus". Döljer Kalender + Sysslor ur flikraden och lyfter
// Recept till en egen flik, för att testa om appens kärna (inköp + veckomeny)
// blir tydligare utan familjeorganisatör-ytorna. Sätt till false för att få
// tillbaka den fulla flikraden. Kalender-/sysslo-rutterna och koden lämnas
// orörda — bara dolda ur flikraden — så deep-links/notiser fortsätter funka
// och experimentet är helt reversibelt.
export const RECIPE_FOCUS_EXPERIMENT = true;
