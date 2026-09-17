# Handlis 2.0.0 — release notes

Samlar ihop flera veckors arbete: fullständig rebrand, ny design i hela
appen, receptimport som faktiskt fungerar tillförlitligt, och en lång rad
buggfixar som kommit direkt ur användarfeedback.

## Play Store — kort "Vad är nytt" (klistra in i Play Console)

> **Handlis har fått ett helt nytt utseende!** Ny logga,
> ny färgpalett och omdesignade skärmar rakt igenom. Receptimport från
> webbsidor är kraftigt förbättrad — funkar nu på fler sajter och tolkar
> amerikanska mått korrekt. Dra och släpp för att ordna om ingredienser.
> Plus en lång rad mindre fixar från er feedback: text som klippts av,
> knappar som var svåra att träffa, och krångel i receptredigeringen.

*(Under 500 tecken, klar att klistra in. Justera fritt.)*

---

## 1. Ny branding

- **Nytt namn:** Veckis → **Handlis** (veckis.se var redan upptaget).
- **Ny logga:** korg + inköpslista, i appens nya färgpalett "skog & lime"
  (mörkgrönt + limegrönt i stället för det gamla indigo/violett).
- Ny app-ikon, splash-skärm och PWA-ikoner genererade från samma koncept.
- **Nytt paketnamn** `com.handlis.app` (första gången det syns på Play).

## 2. Ny design i hela appen ("skog & lime")

Omdesign av samtliga flikar och skärmar, inte bara en kosmetisk palettbyte:

- Inköpslistan, veckomenyn, receptlistan och receptvyn, hushållet, butiker
  och kontosidan har alla fått nya sidhuvuden, kort och knappar i den nya
  paletten.
- Receptvyn: ingredienser visas nu som en riktig inköpslapp (mängd i egen
  kolumn), numrerade tillagningssteg, breda primärknappar.
- Konsekvent mörkgrönt/limegrönt tema för dialoger, ark och bekräftelser
  i stället för blandade gamla och nya stilar.
- Butikens kategori-editor: samma färgspråk, och en riktig "Egen"-badge för
  egna kategorier i stället för en emoji som inte hörde hemma i designen.

## 3. Recept — import, redigering och foto

- **URL-import kraftigt förbättrad:** sajter utan strukturerad receptdata
  (schema.org) gav tidigare bara "hittade inget recept" trots att sidan
  hade tydliga ingredienser/instruktioner. Fångas nu upp av en AI-baserad
  reservtolkning.
- **Amerikanska/engelska mått tolkas nu korrekt** ("1/2 cup", "1 3/4 cup",
  "2 teaspoons" m.fl.) — tre samverkande parsningsbuggar rättade. Enheten
  sparas som källan angav den; en tydlig växel visar receptet omräknat till
  svenska mått (dl/g/msk/kg) för den som vill, och inköpslistan får alltid
  metriska enheter vid överföring.
- **Fota ett recept:** OCR-tolkning av kokboksfoton, stöd för flera sidor
  och flera recept på samma uppslag, med kryssrutor för att välja vilka som
  ska sparas.
- **Dra och släpp** för att ordna om ingredienser vid redigering.
- Sista ingrediens-raden lägger nu automatiskt till en ny rad i stället för
  att kräva ett manuellt tryck på "Lägg till rad".
- Global inlärning av nya ingredienser (t.ex. "sojafärs", "tofu") från alla
  sätt att lägga till recept — inte bara URL-import som tidigare.

## 4. Buggar fixade direkt från er feedback

- Text som klipptes av eller visade fel del av ett ord (receptnamn,
  ingrediensnamn, mängdfältets placeholder) — flera separata textrendering-
  buggar i React Native, rättade en efter en.
- Taggfilter-krysset i receptlistan krävde sidoscroll för att nås med många
  taggar — nu alltid synligt.
- Ett drag-handtag för ingredienser kunde av misstag kapa ett vanligt
  scroll-svep — kräver nu ett kort medvetet håll innan draget startar.
- Diverse krascher och layoutbuggar i PWA:n (bl.a. inköpslistan).
- Prestanda: inköpslistan virtualiserar nu (FlashList) i stället för att
  rendera alla rader samtidigt — märkbart mjukare scroll på långa listor.

## 5. Under huven (inte synligt för användare, men värt att notera för granskningen)

- Krypterad, verifierad databas-backup.
- Driftdokumentation och automatiska underhållspåminnelser.
- Städat bort gamla Render/Neon-beroenden från driftsättningen.
- Engelska felmeddelanden i receptimport-flödet bytta mot svenska.

---

*Sammanställt från commit-historiken sedan senaste Play-släppet
(versionCode 10, v1.2.1) fram till versionCode 11 (v2.0.0).*
