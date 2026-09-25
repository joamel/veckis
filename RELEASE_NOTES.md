# Handlis 2.1.0, bygge 14 — release notes

Fyra intensiva dagar av fixar sedan förra bygget, nästan alla direkt ur
testarnas feedback. Den som har haft appen öppen har redan fått det mesta
som tysta uppdateringar — det här bygget samlar allt i en version, så att nya
installationer får samma app från start.

Versionsnumret är fortfarande 2.1.0. Det är med flit: så länge det inte
ändras når framtida snabbuppdateringar alla, även den som inte hunnit
uppdatera från Play.

## Play Store — kort "Vad är nytt" (klistra in i Play Console)

> Importera varor från en inköpslapp: fota den, välj en bild eller klistra
> in text. Recept visar tillagningstid, taggar går att fästa, och menyn har
> tre nya måltider: mellanmål, fika och förrätt. Listan synkar igen efter
> att telefonen legat låst. Skriv "1 dl havregryn" direkt i fältet, och
> "gurka och tomat" blir två varor. Kryssrutan har flyttat till höger, där
> tummen når. Plus ett fyrtiotal fixar ur er feedback.

*(414 tecken — Play tillåter 500. Den långa listan nedan ryms inte där; den
får nå testarna på annat sätt.)*

---

## Nytt i det här bygget

Allt som ändrats sedan bygge 13. Stryk det som är överkurs — punkterna under
"Under huven" längst ned är nog det för de flesta testare.

### Inköpslistan

- **Importera varor till en lista.** I listans meny: fota en inköpslapp,
  välj en bild eller klistra in text. Du går igenom raderna och bockar i
  vilka som ska med. Stavfel som "Mozarella" och "Creme fraise" matchas mot
  varor du redan har.
- **Listan synkar igen efter att telefonen legat låst.** Förut kunde
  ändringar från andra i hushållet sluta dyka upp tills man gick ut och in
  i listan.
- **Kryssrutan ligger till höger**, där tummen når när man håller telefonen
  i en hand. Varunamnet börjar vid vänsterkanten.
- **Skriv mängden direkt i fältet.** "1 dl havregryn" eller "havregryn
  1 dl" blir varan havregryn med mängden 1 dl, i stället för en vara som
  heter hela meningen.
- **"gurka och tomat" blir två varor** — likaså "vin+öl". Hör de ihop, som
  "kött- och grillkrydda", får de vara kvar som en vara.
- **Kända varor läggs till direkt**, utan mängdrutan. Rutan kommer bara upp
  för varor appen inte känner igen.
- **En hel lista går att ångra** en stund efter att du tagit bort den.
  Meddelanden med en ångra-knapp står också kvar längre.
- Ditt eget kategorival skrivs inte längre över när du lägger till samma
  vara igen.
- "förpackning", "förp" och "frp" räknas som samma enhet, liksom paket/pkt,
  stycken/st och gram/g — så samma vara hittar sin dubblett.
- Beskedet om att en vara lagts till syns igen; tangentbordet låg ovanpå det.

### Veckomenyn

- **Tre nya måltider:** mellanmål, fika och förrätt. Måltiderna bryter rad
  i stället för att scrolla, så ett svep på dem byter inte vecka av misstag.
- **Laga använder menyns portioner.** Har du ändrat antalet portioner i
  menyn får laga-läget rätt mängder. Portionerna låses när rätten redan
  ligger i en inköpslista, eftersom listan har mängderna för de gamla.
- **Gamla veckor visas som historik** i stället för att se tomma ut. Allt
  syns, men går inte att ändra.
- Bilden på dagens kort visar middagen, inte frukosten.
- Kortet säger vilken inköpslista rätten ligger i.
- "I inköpslistan"-märket och överföringen till listan säger samma sak.
  Har listan rensats går rätten att föra över igen, men redan handlade
  rätter bockas inte i av sig själva.
- Drar du ned överföringen stänger den, med valen kvar till nästa gång, i
  stället för att hoppa ett steg bakåt.
- Ingen fråga när du lägger en rätt på en dag som redan har en — med
  frukost, lunch och middag är det det vanliga.
- "Lägg till i meny" ser likadant ut oavsett var du öppnar det, och följer
  appens typsnitt och färger.
- Veckoraden fälls ihop när du scrollar, utan flimmer och utan att scrollen
  hackar.

### Recept

- **Tillagningstid.** Läses från importerade recept och går att ställa in
  själv i en hjulväljare. Syns på korten, i menyn och när du väljer rätt.
- **Fäst taggar** med ett långtryck, så hamnar de först i raden. Ett tips
  visar hur första gången.
- **Tillagningsstegen översätts** när du importerar ett recept på engelska,
  med grader och mått omräknade. ↔-knappen visar hela receptet på
  originalspråket.
- **Timers i laga-läget tål att du bläddrar.** De hör till sitt steg, flera
  kan gå samtidigt, och de nollställs inte när du läser nästa steg.
- Ingredienslistan i laga-läget tar den plats som finns i stället för en
  fast höjd.
- Utsnittet du valt för receptbilden följer med till receptkorten och
  veckomenyn.
- Redigeringen visar samma svenska mått som receptet, inte "cup" bredvid
  "vetemjöl".
- Bråk skrivs likadant i hela mängdkolumnen ("1 1/4 dl"), med bråkdelen
  mindre så den inte läses som "11/4".
- Kompakta receptkort: tid, portioner och antal ingredienser som små ikoner
  under rubriken, så titeln får hela bredden. Samma ikoner inne i receptet.
- Hela raden med portioner, tid och länken "Original" ryms på en rad.
- Ett långtryck på ett receptkort raderar inte längre receptet. Radera
  finns i receptets egen meny.
- Kalenderknappen på korten har en lugnare färg.

### Utseende och övrigt

- Knappar längst ned hamnar inte längre under Androids navigeringsknappar.
- Introduktionen och tipsen har den nya designen och uppdaterade texter.
- Inbjudningskoden går att fälla ihop igen.
- Rundade hörn på alla sidhuvuden, och vald tagg syns i mörkt läge.
- Butiker-knappen har samma färg som knapparna bredvid.
- Appuppdateringar slår igenom direkt i stället för efter flera omstarter.
- Tydligare länk till inloggning med lösenord.

### Under huven

- Verktyg för att städa ingrediensdatan: mängder som hamnat i varunamn,
  två vanliga importfel och ihopskrivna varor. Alla med en granskningsfil
  att gå igenom innan något ändras.
- Städverktygen kontrolleras automatiskt vid varje ändring.
- Verktyg för att felsöka inloggningar.

---

## Tidigare släpp i korthet

### 2.1.0, bygge 12–13 (21 september)

- Varor stannar i sin kategori — inga fler hopp till "Övrigt" av sig själva.
- Recept på engelska översätts vid import, och mått visas som svenska
  köksmått.
- Receptbilden går att dra till rätt utsnitt.
- Mörkt läge i hela den nya designen, och landskapsläge.
- I laga-läget krymper ingredienslistan när du bockar av.
- Fixar för ark som hamnade fel mot tangentbordet, meddelanden på fel
  plats, medlemslistan som hoppade och kryssrutornas träffyta.
- Bygge 13: den som valt inloggning med kod kunde inte komma tillbaka till
  lösenordet.

### 2.0.0, bygge 11 (17 september)

- Veckis blev Handlis: nytt namn, ny logga och ny app-ikon.
- Ny design i hela appen, i skogsgrönt och lime.
- Receptimport från webbsidor fungerar på fler sajter och förstår
  amerikanska mått.
- Fota ett recept, även över flera sidor eller med flera recept på samma
  uppslag.
- Dra och släpp för att ordna ingredienser.
- Mjukare scroll i långa inköpslistor, och en rad fixar för text som
  klipptes av.

---

*Sammanställt från commit-historiken sedan bygge 13 (v2.1.0) fram till
bygge 14 (v2.1.0). Tidigare släpps fullständiga noter finns i git-historiken
för den här filen.*
