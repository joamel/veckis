# App Store – listningsutkast (Handlis)

Bygger på `play-listing.md`, anpassad för App Store: e-postkod, Apple och
Google (från iOS-bygge 6), butikerna med, och Apples fältgränser.

## Språk
Byt **Primary Language** till **Swedish** (App Information) innan texterna
fylls i — annars ligger svenska texter under "English (U.S.)".

## App Information
- **Name** (max 30): Handlis
- **Subtitle** (max 30): Veckomeny och inköpslista
- **Category**: Food & Drink (sekundär: Shopping — inköpslistan i butiksordning är det som skiljer appen från rena receptappar)
- **Content Rights**: **Yes**, innehåller/hämtar tredjepartsinnehåll och har rätten: butiksbanken är OpenStreetMap-data (ODbL, källan anges i butiksväljaren och integritetspolicyn), och receptimport hämtar text och bild från en länk som användaren själv anger — sparas privat i hushållet, publiceras aldrig
- **Age Rating**: svara nej på allt → 4+

## Promotional Text (max 170)
Planera – Inventera – Handla. AI läser in recept från foto, länk eller text. Bocka av det som finns hemma, resten blir en inköpslista i din butiks ordning.

## Description (max 4000)
Handlis samlar hela veckans matplanering på ett ställe – för hela hushållet.

Tre enkla steg som hänger ihop:

📖 Samla dina recept
Spara egna favoriterrecept - importera från en länk eller klistra in en text, fota ett handskrivet recept eller en gammal kär kokbok. Allt finns samlat och sökbart, och favoriterna taggar du upp för att enkelt hitta igen.

🍽️ Planera veckan
Lägg in recept i veckomenyn. Ni ser direkt vad ni ska äta – frukost, lunch eller middag – och kan enkelt flytta rätter mellan dagar.

🛒 Handla tillsammans
Överför ingredienserna från veckomenyn till inköpslistan med ett tryck. Bocka av i realtid medan någon annan fyller på – ingen köper dubbelt, inget glöms.

Det som gör Handlis smart:
• Ingredienser från veckomenyn slås ihop, du inventerar vad som redan finns hemma och resten hamnar på inköpslistan.
• Varor hamnar automatiskt i rätt kategori och dubbletter slås ihop.
• Välj din riktiga butik bland Sveriges matbutiker – sök eller tryck "Nära mig".
• Listan lär sig i vilken ordning du går i butiken, så plocklistan följer din rutt.
• Ge kategorierna butikens egna namn, så att listan matchar skyltarna.
• Realtidsdelning – alla i hushållet ser samma lista och samma veckomeny, direkt.
• "Jag handlar" – säg till att du är i butiken så kan andra skicka med varor live.
• Listan fungerar även utan täckning i butiken.
• Spara veckomenyer som mallar för att förenkla planeringen.
• Ljust och mörkt tema, snabbt och avskalat.

Handlis är gjort för familjer med delat hushåll som vill slippa lappar på kylen, dubbelköp och "vad ska vi äta?" varje kväll.

Kom igång på under en minut – logga in med e-post, Apple eller Google, skapa ditt hushåll och bjud in de andra.

## Keywords (max 100, kommaseparerat utan mellanslag)
matsedel,recept,handlingslista,shoppinglista,storhandla,matplanering,veckohandling,hushåll,handla

97 tecken, 98 byte (å räknas som 2 — håll marginal). App Store kombinerar orden i namn,
undertitel och nyckelord, så ord som redan står i "Handlis" / "Veckomeny och
inköpslista" är bortkastade här. Inga butikskedjenamn (ICA, Coop …) — Apple
nekar varumärken man inte äger. Byt ut ord som inte ger visningar efter några
veckor (App Store Connect → App Analytics → Sources → App Store Search).

## URL:er
- **Support URL**: https://handlis.app
- **Marketing URL**: https://handlis.app
- **Privacy Policy URL** (App Privacy): https://handlis.app/privacy

## Copyright
2026 Joakim Melander

## App Review Information
- **Sign-in required**: ja
- **User name**: joamelander+review@gmail.com
- **Password**: (samma som för Play-granskningen)
- **Contact**: Joakim Melander, support@handlis.app, telefonnummer
- **Notes**:

  > Handlis is a Swedish meal-planning and shopping-list app for households. Sign in with the demo account using "→ Logga in med lösenord istället" (sign in with password). The account belongs to a demo household where you can add recipes, plan the weekly menu and use the shopping list. Location ("Nära mig") is only used, when the user taps it, to show nearby grocery stores. Sign in with Apple and Google are offered alongside email sign-in.

  ⚠️ Granskningsbiljetten kräver att `REVIEW_ACCOUNT_EMAIL` är satt på Railway (se `app/src/lib/reviewAccount.ts`) — annars fastnar granskaren på e-postkoden. Kontrollera innan inskick.

## Release
**Manually release this version** – så att du själv väljer dag efter godkännandet.

## Skärmdumpar (iPhone 6,1"/6,3": 1206 × 2622 eller 1179 × 2556)
App Store Connect (2026) har rutan "iPhone with Dynamic Island" som bara tar
6,1"/6,3"-mått — 1320 × 2868 och 6,5"-måtten avvisas där med "File dimensions
are invalid". Statusraden målas över och bilderna skalas till 1206 × 2622 —
färdiga i `app/assets/ios/clean/6.3/`. Ladda upp under fliken "App Previews and
Screenshots", inte "Header and Search Results" (den vill ha liggande bilder).
Minst 3, de tre första syns vid installation. Förslag på ordning:
1. Veckomenyn med några planerade dagar
2. Inköpslistan i butiksordning
3. Receptlistan / ett recept
4. Butiksväljaren ("Nära mig")
5. Delning – hushållet / "Jag handlar"

Ta dem på iPhone via TestFlight-appen och skicka originalen som dokument
(AirDrop/mejl) — WhatsApp skalar ned bilderna och de blir mjuka vid uppskalning.

## App Privacy (integritetsetiketter)
Tracking: **Nej** (ingen reklam, inga analysverktyg från tredje part).

| Datatyp | Används till | Kopplad till användaren | Tracking |
|---|---|---|---|
| Contact Info → Email Address | App Functionality | Ja | Nej |
| Contact Info → Name (från Apple-/Google-inloggning, valfritt) | App Functionality | Ja | Nej |
| User Content → Photos or Videos (receptbilder) | App Functionality | Ja | Nej |
| User Content → Other User Content (recept, listor, veckomeny) | App Functionality | Ja | Nej |
| Identifiers → User ID | App Functionality | Ja | Nej |
| Identifiers → Device ID (push-token för aviseringar) | App Functionality | Ja | Nej |
| Usage Data → Other Usage Data (när varor bockas av — lär listan butikens gångordning) | App Functionality | Ja | Nej |
| Location → Coarse Location ("Nära mig", avrundas till 2 decimaler, lagras inte) | App Functionality | Nej | Nej |
| Diagnostics → Crash Data (krascher rapporteras via `/api/client-errors`) | App Functionality | Nej | Nej |
| Diagnostics → Other Diagnostic Data (felrapporter via egen backend till Sentry — personuppgiftsbiträde, inte tracking; skickas utan inloggning) | App Functionality | Nej | Nej |
