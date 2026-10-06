# App Store – listningsutkast (Handlis)

Bygger på `play-listing.md`, anpassad för App Store: ingen Google-inloggning
på iOS (e-postkod + Apple), butikerna med, och Apples fältgränser.

## Språk
Byt **Primary Language** till **Swedish** (App Information) innan texterna
fylls i — annars ligger svenska texter under "English (U.S.)".

## App Information
- **Name** (max 30): Handlis
- **Subtitle** (max 30): Veckomeny och inköpslista
- **Category**: Food & Drink (sekundär: Lifestyle)
- **Content Rights**: innehåller inget tredjepartsinnehåll (receptbilder laddas upp av användaren själv)
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

Kom igång på under en minut – logga in med e-post eller Apple, skapa ditt hushåll och bjud in de andra.

## Keywords (max 100, kommaseparerat utan mellanslag)
inköpslista,matsedel,veckomeny,recept,matplanering,handla,familj,hushåll,butik,delad lista,mat

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

  > Handlis is a Swedish meal-planning and shopping-list app for households. Sign in with the demo account using "→ Logga in med lösenord istället" (sign in with password). The account belongs to a demo household where you can add recipes, plan the weekly menu and use the shopping list. Location ("Nära mig") is only used, when the user taps it, to show nearby grocery stores. Sign in with Apple is offered alongside email sign-in.

  ⚠️ Granskningsbiljetten kräver att `REVIEW_ACCOUNT_EMAIL` är satt på Railway (se `app/src/lib/reviewAccount.ts`) — annars fastnar granskaren på e-postkoden. Kontrollera innan inskick.

## Release
**Manually release this version** – så att du själv väljer dag efter godkännandet.

## Skärmdumpar (6,5": 1284 × 2778 eller 1242 × 2688)
Minst 3, de tre första syns vid installation. Förslag på ordning:
1. Veckomenyn med några planerade dagar
2. Inköpslistan i butiksordning
3. Receptlistan / ett recept
4. Butiksväljaren ("Nära mig")
5. Delning – hushållet / "Jag handlar"

Ta dem på iPhone via TestFlight-appen; skärmdumpar från en nyare iPhone har
annan upplösning och skalas om till 1284 × 2778.

## App Privacy (integritetsetiketter)
Tracking: **Nej** (ingen reklam, inga analysverktyg från tredje part).

| Datatyp | Används till | Kopplad till användaren | Tracking |
|---|---|---|---|
| Contact Info → Email Address | App Functionality | Ja | Nej |
| Contact Info → Name (från Apple-inloggning, valfritt) | App Functionality | Ja | Nej |
| User Content → Photos or Videos (receptbilder) | App Functionality | Ja | Nej |
| User Content → Other User Content (recept, listor, veckomeny) | App Functionality | Ja | Nej |
| Identifiers → User ID | App Functionality | Ja | Nej |
| Location → Coarse Location ("Nära mig", lagras inte) | App Functionality | Nej | Nej |
| Diagnostics → Other Diagnostic Data (felrapporter via egen backend till Sentry — personuppgiftsbiträde, inte tracking) | App Functionality | Ja | Nej |
