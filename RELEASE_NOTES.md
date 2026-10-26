# Handlis 2.3.0, Android-bygge 25 — release notes

Laga-läget med timrar som håller koll, och recept som ser ut som i
kokboken. Versionen är fortfarande 2.3.0: allt nedan utom exakta larm på
Android är ute som snabbuppdatering till alla med 2.3.0, även på iPhone.
Bygge 25 behövs bara för att timerns notis ska komma på sekunden när appen
är stängd (Android). Inget nytt iOS-bygge — iPhone larmar redan i tid.

## Play Store — kort "Vad är nytt" (klistra in i Play Console)

> **Laga utan att tappa tråden** – lägg undan laga-läget och fortsätt där du var. Klockan nere till höger visar alla timrar, även från flera rätter, och larmar när tiden är slut. Starta egna timrar med namn, t.ex. ”Äggen”. **Recept som i kokboken**: underrubriker som ”Fyllning” och mängder som ”ca 13 dl” eller ”3–4 dl”. Dessutom: flera recept ur samma text och ändra mängden direkt i inköpslistan.

*(389 tecken utan stjärnorna — Play tillåter 500.)*

## App Store — "Nyheter" (till nästa iOS-bygge; innehållet är redan ute som snabbuppdatering)

> Laga utan att tappa tråden
> Lägg undan laga-läget och fortsätt där du var – steget, det du redan hällt i och alla timrar finns kvar. Klockan nere till höger visar vad som är igång, även från flera rätter samtidigt, och larmar med ljud och vibration tills du tittar till maten. Starta egna timrar med namn, till exempel ”Äggen”.
>
> Recept som i kokboken
> Underrubriker som ”Deg”, ”Fyllning” och ”Garnering” följer med när du hämtar ett recept, så mjölken i degen och mjölken i såsen hålls isär. Mängder som ”ca 13 dl”, ”3–4 dl” och ”ev. 1 dl russin” står kvar som receptet skrev dem – inköpslistan räknar med den högre siffran, och tillval bockas inte i av sig själva.
>
> Dessutom
> • Flera recept ur samma länk eller text, till exempel en hel veckomeny i en Instagram-bildtext
> • Ändra mängden direkt efter att du lagt till en vara i inköpslistan
> • Dela en veckomall med någon annan
> • Recept utan bild får en stor matsymbol

## Nytt sedan bygge 24

- **Laga-läget går att minimera** — steg, avbockade ingredienser och timrar finns kvar. Klockan nere till höger (även inne i laga-läget) visar kortaste nedräkningen och öppnar "Pågående lagning" med alla rätter och timrar; tryck för att gå till ett steg eller byta rätt. Receptsidan säger "Fortsätt laga · steg 3".
- **Larm** — ljud och vibration var tredje sekund tills man reagerar (högst en minut) när en timer slår om med appen öppen; notisen när den är stängd. Med appen öppen kommer ingen sen notis i efterhand.
- **Egna timrar** med valfritt namn, max 3 timrar per rätt. Bara krysset stoppar en timer. Avslutar man laga-läget med timrar igång frågas först.
- **Exakta larm på Android** (kräver bygge 25): SCHEDULE_EXACT_ALARM. Android 12–13 beviljar den direkt; från Android 14 tipsar laga-läget en gång om "Alarm och påminnelser".
- **Underrubriker i ingredienslistan** — från AI-tolkningen och från receptsajter (även Kökets "Fyllning"-rader); samma vara under olika rubriker slås inte ihop i receptet, men väl i inköpslistan.
- **Mängder som i receptet** — "ca", "drygt", "knappt", "ev." och intervall sparas; inköpslistan räknar med den övre gränsen; "ev."-varor är inte förbockade vid överföring och börjar som "har hemma" i inventeringen. Mängden efter "ca" missades förut helt, och "1–2 tsk" blev 1,2 tsk.
- **Flera recept ur en länk eller inklistrad text**.
- **"Ändra mängd"** i bekräftelsen efter att en vara lagts till i inköpslistan; platshållaren visar att mängden kan skrivas direkt ("T.ex. 5 dl mjölk").
- **Dela veckomall**.
- **Matsymbol** för recept utan bild — stor och centrerad, och korten utan bild är lägre.
- **I bakgrunden**: AI-tolkningen gör bara recept (längdtak, 30 tolkningar per dygn och konto), och fel från AI-tjänsten visas som läsbar text.

---

# Handlis 2.3.0 — release notes

Dela recept direkt till Handlis, och snabblistan för de varor du köper varje
vecka. Versionsnumret höjs den här gången: dela-funktionen är en ny
native-modul, och en snabbuppdatering som använder den hade kraschat på
telefoner med ett äldre bygge. Den som inte uppdaterar från butiken får
därför inte längre snabbuppdateringar — "Vad är nytt" ska ge ett skäl att
uppdatera.

## App Store — "Nyheter" (bygge 11 och senare)

> Spara recept direkt i Handlis
> Hittar du ett recept i webbläsaren eller på Instagram? Tryck på Dela och välj "Spara i Handlis" – receptet hämtas direkt, utan att du behöver kopiera länken.
>
> Skriv vad du är sugen på
> Skriv till exempel "frasiga våfflor" så skriver Handlis ett recept åt dig – eller fota ett handskrivet recept eller en sida ur tidningen. Nya recept öppnas direkt för redigering, med dina egna taggar, som "snabb" eller "vegetariskt", redan föreslagna.
>
> Butiken lär sig din väg
> En ny butik börjar i samma ordning som liknande butiker, till exempel andra ICA Maxi. Sedan uppdateras ordningen av sig själv efter hur du handlar – och varje ändring går att ångra.
>
> Snabblistan
> Spara varorna du köper varje vecka, med önskad mängd, och lägg till dem på inköpslistan med ett tryck.
>
> Dessutom
> • Förhandsgranska veckomallar innan du lägger in dem
> • Fler varor hamnar i rätt kategori, bland annat disk- och tvättmedel
> • Rensa i inköpslistan rensar bara de klarmarkerade varorna i stället för hela listan
> • Butiksvalet går igenom direkt, och vald butik markeras
> • Tangentbordet i inköpslistan stänger sig när du vill
> • Veckomenyn hamnar rätt när du byter vecka

## Play Store — kort "Vad är nytt"

> **Dela recept till Handlis** från webbläsaren eller Instagram. **Skriv vad du är sugen på** – t.ex. ”frasiga våfflor” – så skriver Handlis ett recept, och nya recept får dina taggar föreslagna. **Butiken lär sig din väg** och uppdaterar ordningen själv. **Snabblistan** för varor du köper varje vecka. Plus: förhandsgranska veckomallar, fler varor i rätt kategori, rensa bara klarmarkerade och snabbare butiksval.

*(397 tecken — Play tillåter 500.)*

Det som kom efter bygge 11 (taggförslag, "skriv vad du är sugen på", butikens
startordning och automatiska ordning, förhandsgranskade mallar, nya
kategoriregler) är ute som snabbuppdatering till 2.3.0 och behöver inget nytt
bygge — den som installerar bygge 11 får det vid första start.

## Nytt sedan 2.2.0

- **Dela till Handlis** — dela en länk eller en text från en annan app till Handlis; receptfliken öppnas med länken i "Hämta från länk" eller texten i "Klistra in". Kräver det här bygget.
- **Snabblistan** — egna vardagsvaror med egen mängd, "Välj alla", "Välj från det du handlat", av/på per lista. (Ute som snabbuppdatering sedan 2026-10-16.)
- **Rensa klarmarkerade** i stället för att tömma hela listan.
- **Butiksvalet** går igenom första gången; vald butik markeras i grönt.
- **Tangentbordet** i inköpslistan går att stänga och kommer inte tillbaka efter ett ark.
- **Veckomenyn** landar överst vid veckobyte, och veckoraden syns igen.
- **Skriv vad du är sugen på** — "frasiga våfflor" i klistra in-fältet ger ett eget recept (bara inklistrad text, aldrig webbsidor).
- **Importerade recept öppnas i redigeringsläget**, med hushållets egna taggar föreslagna (snabb vid högst 20 min, kost bara ur rubriken); taggarna pulserar. Korgen visas medan importen pågår. Receptmenyn har tre val i stället för fem.
- **Butikens ordning** — en ny butik startar i den ordning andra sorterat samma butik, kedja och format; ordningen uppdateras automatiskt (ett reglage, på som standard, med Ångra), och den egna vägen väger tyngre än andras.
- **Veckomallar** fälls ut och visar rätterna innan man lägger in dem.
- **Kategorier** — disk- och tvättmedel, papper, påsar och sammansatta ord hamnar rätt; korv- och hamburgerbröd egen underkategori; alkohol föreslås inte för alla.
- **iOS** — ark med text i går att stänga, och frågor efter en meny syns.

---

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
