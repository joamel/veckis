# Handlis 2.1.0, bygge 16 — release notes

Butiken i centrum: välj din riktiga butik, låt listan lära sig i vilken
ordning du går, och ge kategorierna de namn som står på skyltarna. Plus att
varor hamnar i rätt kategori — kakao bland bakvarorna, inte brödet. Den som
har haft appen öppen har redan fått det mesta som tysta uppdateringar. Det
nya som kräver det här bygget är "Nära mig", som behöver telefonens
platstjänst.

Versionsnumret är fortfarande 2.1.0. Det är med flit: så länge det inte
ändras når framtida snabbuppdateringar alla, även den som inte hunnit
uppdatera från Play.

## Play Store — kort "Vad är nytt" (klistra in i Play Console)

> **Hitta din butik och handla i rätt ordning.** Välj bland Sveriges matbutiker – sök eller tryck "Nära mig". Listan lär sig i vilken ordning du går och föreslår en ordning, även utifrån andra hushåll i samma butik. Ge kategorierna butikens egna namn och samla underkategorier under egna rubriker. Bläddra bland varor per underkategori. Varor hamnar i rätt kategori. Favoritrecept med hjärta. Listan fungerar utan täckning. Plus många fixar.

*(439 tecken — Play tillåter 500.)*

---

## Nytt i det här bygget

Allt som ändrats sedan bygge 15. Punkterna under "Under huven" längst ned
är nog överkurs för de flesta testare.

### Butiken

- **Butiksbanken.** Välj din butik bland Sveriges matbutiker (från
  OpenStreetMap): sök på namn, ort eller postnummer, eller tryck **Nära mig**
  för de närmaste. Appen frågar om ungefärlig position — aldrig exakt, aldrig
  i bakgrunden — och den sparas inte.
- **Listan lär sig butikens ordning.** När du bockar av i en lista som är
  kopplad till en butik märker appen i vilken ordning du går. Efter tre
  handlingar föreslår butiksvyn en ordning på kategorierna — du väljer
  själv om du vill använda den.
- **Förslaget blir bättre av fler.** I en butik ur butiksbanken räknas även
  andra hushålls handlingar i samma butik med — bara standardkategorierna,
  och först när minst två andra hushåll bidragit, så att ingens väg genom
  butiken går att utläsa.
- **Byt namn på kategorier i en butik.** "Konserver & torrvaror" kan heta
  "Skafferi" på ICA och "Torrvaror" på Coop. Fäll ut kategorin i butiksvyn
  och välj "Byt namn i den här butiken".
- **Underkategorier var som helst.** Lyft ut en underkategori och dra den
  dit den står i butiken, även långt från sin kategori. Flera från samma
  kategori bredvid varandra blir en hopfällbar rad.
- **Egna rubriker.** Skapa en rubrik, till exempel "Frukost", och dra
  underkategorier direkt under den — flingor, sylt, pålägg — så hamnar
  deras varor där i listan.
- **Underkategorier är alltid gemensamma.** Egna underkategorier finns inte
  längre; saknas en, säg till så läggs den till för alla. Nya i det här
  bygget: **Taco & Tex-Mex** och **Matlagningsost**.

### Inköpslistan

- **Fungerar utan täckning.** Bockar sparas på telefonen och skickas när
  nätet är tillbaka, även om appen stängts, och listan går att öppna utan
  nät.
- **Kategoriväljaren** (rutnätsknappen bredvid fältet): bläddra bland varor
  per underkategori, med knappar för att visa bara en. Rutan står kvar
  öppen när du lagt till en vara, så du kan plocka flera i rad, och varor
  som redan finns i listan har en bock. Bakåt går tillbaka till rutnätet,
  allt följer butikens ordning och namn, och rutan hoppar inte i höjd.
- **Varor hamnar i rätt kategori.** Kakao låg under Bröd, kaffe under Dryck,
  falukorv under Kött, kokosmjölk under Mejeri och oregano bland de färska
  örterna. Nu följer allt samma regler, och "1 tsk timjan" från ett recept
  blir torkad timjan i kryddhyllan. Har du själv flyttat en vara gäller ditt
  val.
- **Fler vanliga hushållsvaror** i sökningen och kategoriväljaren:
  kaffefilter, fryspåsar, diskborste, toalettpapper, batterier, kattmat
  med flera.
- Mängder skrivs som bråk ("1 1/2 dl"), och msk och dl av samma vara räknas
  ihop.
- Andras ändringar fortsätter komma fram även när anslutningen tyst dött
  med appen öppen.
- Ingen evig snurra när appen startas efter lång tid.

### Inventeringen

- Sorteras efter butikens kategorier och använder hushållets egna
  kategorival.
- Ett reglage överst: "Salt, peppar och vatten finns" — de självklara
  basvarorna bockas av på en gång, och valet sparas.

### Recept och meny

- **Favoriter med hjärta** — i receptvyn och på korten, och alltid först i
  taggraden. Fästa taggar sorteras efter antal recept.
- Länken till receptet hittas även när receptnamnet står före den, som när
  man delar från ICA.
- Samma listväljare i menyn och receptet, där du också kan skapa en ny
  lista direkt.

### Utseende och övrigt

- Knappar tonas ned medan fingret är nere, så man ser att trycket tog.
- Kategorinamn i butiksvyn klipps inte längre på Android.
- Integritetspolicyn är uppdaterad med position, butiksordning och de
  gemensamma sökförslagen.

### Under huven

- En rapport över var hushållen är oense med kategoriklassningen, så
  felklassade varor kan rättas för alla.
- Basvaror skiljer nu på ett eget val och en gissning, så en gammal
  gissning aldrig vinner över rätt kategori.
- Tillfällig inloggningsväg för Play-granskarens konto.

---

## Tidigare släpp i korthet

### 2.1.0, bygge 14–15 (25–27 september)

- Importera varor från en inköpslapp: fota, välj en bild eller klistra in
  text.
- Inköpslistan synkar igen efter att telefonen legat låst.
- Skriv "1 dl havregryn" direkt i fältet, så hamnar mängden rätt.
- Kryssrutan har flyttat till höger, där tummen når.
- Tillagningstid på recept, zoombar receptbild, fästa taggar och tre nya
  måltider: mellanmål, fika och förrätt.

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

*Sammanställt från commit-historiken sedan bygge 15 (v2.1.0) fram till
bygge 16 (v2.1.0). Tidigare släpps fullständiga noter finns i git-historiken
för den här filen.*
