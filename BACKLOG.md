# Veckis — Backlog

## UI-förbättringar/buggar

### Generellt
- [x] Kunna ha appen i horisontalläge i tablet-format (tablet-format supporteras, portrait-first på phone)
- [x] Skärmen borde hoppa upp när man ska skriva in något så man ser vad man skriver
- [x] Snyggt om man kan hålla inne på inköpslistor/aktiviteter/sysslor/meny så att de skakar om man vill redigera dem och att det kommer upp en delete (x) /redigeringsknapp (penna)
- [x] Emoji bakom hushållsnamnet saknas i inköps- och meny-fliken
- [x] Texten hoppar inte upp ovan tangentbordet för Lägga till lokala profiler, nya inköpslistor och butiker
- [x] Om flera inputfält i samma form borde det finnas en "nästa" i tangentbordet
- [x] Toast för fler händelser: ~~"Inköpslista rensad"~~, ~~"Syssla sparad"~~, ~~"Hushåll borttaget"~~ m.fl.
- [x] kan vi ha en optimisisk uppdatering (generellt) så att frontend inte alltid väntar på backend svar innan den flyttar något, skapar något osv?
- [x] exempeltexter syns inte mot den ljusa bakgrunden
- [x] rensa filter med ett x bredvid filterknappen?
- [ ] Ännu större font och knappar/pilar mm i tablet-vyn. Idag ser de nästan mindre ut än i mobilversionen.
- [ ] sysslor och aktiviteter skulle kunna ha en emoji likt maträtter för att få samma stil på korten i kalendern.
- [ ] möjligt med horisontell-vy i tablet
- [x] Ångra-toast för destruktiva åtgärder (rensa inköpslista) — knapp "Ångra" i toasten i ~5 sekunder (resten kan adderas vid behov)
- [ ] Utvidga realtidsuppdatering (WebSocket) till meny, sysslor, kalender och inställningar så alla hushållsmedlemmar ser samma data
- [ ] Long press-symmetri: kontrollera att redigering via long press finns konsekvent på basvaror, butiker och kategorier (inte bara inköpslista/maträtt/aktivitet/syssla)
- [ ] Pushnotiser — specificera per typ: påminnelse innan aktivitet startar, förfallen syssla, någon har rensat aktiv inköpslista, ny medlem i hushållet
- [x] Bannern ovan appen borde vara svart/neutral så man ser klockan, notiser mm
- [ ] Ljud för toasts eller liknande. Avcheckning inköpslistan eller överföring av meny
- [ ] Flertal ställen i appen när inputfälten fortfarande inte hoppar upp ovan tangentbordet. Säkerställ att alla inputfält har rätta beteendet

### Inställningar
- [x] kunna ta bort hushåll (som admin)
- [x] Admin-funktioner (redigera/ta bort hushåll och användare) visas i en dedikerad "Administrera hushåll"-sektion som bara syns för admins — ingen toggle, sektionen är alltid kollapsad/tydligt avskild
- [x] Admin-badge vid profilnamnet i inställningar så det är tydligt vilka rättigheter man har
- [x] Lokala users ses som samma och delar uppgifter och markeras ihop. Måste ses som individuella profiler.
- [x] Kan inte lägga till nya lokala användare
- [x] Admin-vyn borde kunna tas bort och istället admininstrera users direkt under medlemmar samt byta namn och ta bort hushåll direkt på hushållet.
- [x] Ta bort hushåll borde behöva bekräftas genom att skriva in "DELETE" manuellt och bekräfta, för att inte råka ta bort hushållet.
- [x] Står hushålet istället för hushållet
- [x] Bekräfta med knapp innan man byter hushåll
- [x] man borde välja nickname när man loggar in för första gången innan man kommer till hushållet. Annars plockar appen ens riktiga Gmail namn t.ex. och det kanske man inte vill.
- [x] just nu kan bara admin byta namn på användare. Man bör kunna byta sitt eget namn.
- [x] Onboarding vid första inloggning: efter nickname-val ska användaren välja "skapa nytt hushåll" eller "gå med via inbjudningskod"
- [x] varna admin innan man lämnar fliken om redigeringsläget är igång.
- [x] möjlighet att kunna dela ut admin
- [ ] inställningar uppdateras inte automatiskt för alla användare när någon gör ändringar.

### Inköpslistan
- [x] Kunna redigera butiker direkt från inköpsfliken, både butikens namn och redigera, lägga till och ta bort kategorier. Gör den som "recept"-knappen i meny-fliken
- [x] När man lägger till en inköpslista borde man kunna välja butik direkt -> skapa butik om den inte finns
- [x] Även kunna redigera namnet på ingrediensen när man long pressar
- [x] Byt punkt mot komma i ingredienser (1.5 tsk -> 1,5 tsk)
- [x] Gemener när man skriver in Ingredienser mm. Även basvaror bör vara med gemener
- [x] kunna skapa en inköpslista när man trycker att man vill överföra till inköpslista och det inte finns någon.
- [x] byta arkivera mot rensa inköpslista när man är klar
- [x] Sortera ingredienser inom kategori i bokstavsordning
- [x] när man skriver in ingredienser, enhet och mått borde standard vara gemener i inputfältet
- [x] Möjlighet att rensa inköpslista när man är klar istället för att arkivera den
- [x] Slå ihop ingredienser med samma namn men olika mått — förslag "Det finns X likadana varor — vill du slå ihop dem?" med ny mängd/enhet som ersätter befintliga
- [x] Ge någon typ av feedback när en basvara lagts till. Kanske en liten toast!
- [x] Toast bör visa varans namn ("havregryn sparad som basvara"), ha grön bakgrund och sitta ovanför sökrutan utan att krocka med tangentbordet
- [x] Innan basvara läggs till bör man även ange mängd +/- och förbestämd enhet med möjlighet att ändra
- [x] Tar man bort maträtt från inköpslista tas inte ingredienser bort som även delas med andra recept (Ex: 4 ägg i inköpslistan ligger kvar om man tar bort pannkakor [3 av 4 äggen])
- [x] Finns dubbletter av en maträtt i samma inköpslista tas bådas ingredienser bort när man tar bort den ena maträtten
- [x] Rensa-knappen borde bara synas om inköpslistan har innehåll
- [x] rubriken på inköpslistan syns knappt i ovankant
- [x] Basvaror hamnar i annan kategori i inköpslistan än var de väljs ifrån (ex frysta räkor [frysvaror] hamnar i Kött & Fisk)
- [x] Ersätt "{basvara} sparad som basvara" med "{Basvara} tillagd till inköpslistan"
- [x] Lilla counten till höger om kategorin i inköpslistan tillför inget.
- [x] Addera summan av mängden på ingredienser som ska slås ihop och föreslå senast angivna enheten (om tom, den näst senast angivna)
- [x] ha föreslagna enheter när man justerar dubbletter
- [x] tillbaka- och rensaknappen på inköpslistan syns knappt i ovankant
- [x] Hitta normaliserade ingrediensnamn och på så vis kunna slå ihop "klyftor vitlök" med "vitlök" och "standardmjölk" med "mjölk" i inköpslistan samt pluralis till singularis "tomater" -> "tomat"
- [x] Om man vill lägga till egen basvara borde den även lägga till varan i databasen om den inte redan finns (förutsatt att man lägger till en kategori)
- [x] ha föreslagna enheter när man lägger till/redigerar basvaror
- [x] Drag-n-droppa ingredienser på varandra om man vill slå ihop dem och få upp dubblettvyn.
- [x] En liten "dubblett-knapp" med passande emoji strax ovanför varorna till höger borde poppa upp (någon animation som snurrar/blinkar en gång när man öppnar inköpslistan) där man kan hantera dubbletterna istället för att de kommer upp automatiskt när man går in i listan.
- [x] Komma ihåg vilken kategori en vara hör till nästa gång om man har flyttat om en vara (t.ex. från övrigt -> mejeri). Ska gälla över alla inköpslistor
- [x] Sortera varor inuti kategorisöket i bokstavsordning när man ska lägga till en ny basvara
- [x] Det ser inte ut som att alla varor syns i kategorin. Kan t.ex. söka fram vitlök men inte hitta den när jag scrollar i kategorin.
- [x] Under dubblett-knappen skulle man kunna ha en "markera dubbletter själv"-knapp för att slå ihop varor manuellt
- [x] Slå ihop varor gör felaktigt "," -> "." i totalen
- [x] Under dubblett-knappen borde man kunna trycka vidare till nästa dubblett om man varken vill ignorera eller slå ihop varorna just där och då
- [x] Vissa varor har stor bokstav och vissa har små. Borde kanske lagras i databasen med gemener men ha inledande stor bokstav i UI:et.
- [x] Borde kanske gå att klarmarkera alla varor med en box överst?
- [x] Kunna importera en veckomeny direkt in i en inköpslista med en knapp (+ från tom-state, eller 3-prickar-menyn)
- [x] När man lägger till ny basvara borde även kategori synas under enhetsfältet så att man kan ändra om den ligger i fel kategori
- [x] Dubblett-knappen borde skaka lite längre så man hinner sen den.
- [x] Dubblettknappen borde även finnas under "3 prickarna" uppe till höger. Om inga dubbletter finns borde dubblett-knappen bara visas under "3 prickarna".
- [x] Om man importerar veckomeny från en inköpslista så borde den inte fråga vilken inköpslista man vill överföra till samt redirecta tillbaka till den inköpslista man var inne i.
- [x] Om man ångrar import borde man återgå till inköpslistan istället för att hamna i veckomenyn
- [x] När man har flera dubbletter vore det snyggare om allt sparas efter att man klickat klart genom dubbletterna istället för varje gång man trycker på "slå ihop". Så istället kommer nästa sömlöst upp när man trycker på slå ihop.
- [ ] Borde gå att lägga till egna kategorier och ta bort kategorier i butiker.
- [ ] Automatiskt slå ihop ingredienser av samma typ och måttenhet. Funkar inte när man importerar recept in i befintlig inköpslista.
- [x] När man byter enhet på en basvara läggs den till under kategori istället för att ersätta den gamla så att man får dubbletter. Bättre att den bara uppdaterar enheten istället.
- [x] Redigera vara borde se likadan ut som lägga till ny vara-vyn (förutom att man ska kunna redigera varunamnet).
- [x] Ny varuvyn borde komma upp även när man lägger in vara manuellt i inputfältet
- [x] Enheter har stor bokstav i dubblettvyn.

### Meny
- [x] "+" borde försvinna från en dag som redan har en rätt inlagd
- [x] Knapp för att kunna överföra hela veckomeny till inköpslistan (kryssa ur om det är någon rätt man av någon anledning inte vill överföra)
- [x] Lägg till alla dagar i menyn även om de är tomma så att det är lätt att lägga till rätt
- [x] I menyn räcker det med veckonummer överst då vi har datumen per dag
- [x] Har man samma rätt två gånger måste man kunna hålla reda på ingredienser som hör till rätt #1 och #2 för att sedan kunna ta bort/lägga till dem i inköpslistan. Gäller även om de ligger i olika veckomenyer.
- [x] Varna om man försöker flytta en befintlig rätt till en dag som redan har en rätt inlagd
- [x] Kunna byta namn och redigera recept med long press
- [x] Kunna ersätta en maträtt i menyn mot en annan — long press → "Byt ut mot annan rätt"
- [x] Enklare kunna flytta maträtter mellan dagarna med long press för att ta tag i och dra.
- [x] Ej lägga till recept igen om den känner igen url
- [x] Ersätta popup med toast om att maträtter blivit överförda till inköpslistan
- [x] Portionsskalning i recept — stepper ovanför ingredienslistan som skalar alla mängder (t.ex. 4→8 portioner)
- [x] Realtidsuppdatering av inköpslistan — polling eller WebSocket så att ändringar syns direkt för alla hushållsmedlemmar
- [x] Sök/filtrera bland recept — sök på namn eller ingrediens ("vad kan jag laga med lax?")
- [x] Om man skalar receptet borde man få varning om att inköpslistan kan påverkas alt att inköpslistan automatiskt justeras
- [x] Bekräftelsedialog innan man tar bort maträtt
- [x] När man skapar nytt recept borde man direkt komma till att lägga in första ingrediensen istället för att behöva trycka på redigera-knappen
- [x] Saknas tillbaka-knapp i recept-vyn
- [x] optimistisk uppdatering av menyn när man lägger till en maträtt
- [x] Om dagen är tom borde det gå att trycka över hela rutan för att lägga till ny maträtt
- [x] Kunna lägga till ett nytt recept direkt under "+" i veckomenyn om man saknar en rätt bland befintliga recept
- [x] Skulle vara snyggare om man valde från receptvyn när man väljer ny maträtt istället för en egen dialog (alt att den ser likadan ut som receptvyn).
- [x] ta bort "Flytta till dag"-sektionen i utfällda meny-vyn. Behövs inte då vi har drag-n-drop
- [x] om man trycker på ett mått i enhetsfältet borde man automatiskt hoppa till nästa i
- [ ] Man måste kunna inventera (checka i ingredienser) vad man har hemma innan man överför maträtten till inköpslistan.
  skapa nytt recept-vyn
- [ ] när man lägger in nytt recept borde man få förslag när man börjar skriva in ingredienser typ ("ban" -> "banan") likt när man lägger till basvara i inköpslistan
- [x] När man överför ingrediensern med shopping-carten direkt i ett recept borde det inte gå att välja någon lista om ingen ingrediens är vald
- [x] När man överför ingredienser direkt med shopping-cart funktionen blir det en spinner på alla inköpslistor istället för den man tryckt på. Och istället för en toast blir det en dialog vilket inte följer resten av designen
- [x] Hela rubriken "Originalrecept" syns inte inuti ett recept. Bara "Originalrecep"


### Kalendern
- [x] Kunna välja heldag på en aktivitet
- [x] Kunna redigera en aktivitet genom att hålla inne på aktiviteten
- [x] Kunna göra aktiviteter återkommande
- [x] Återkommande sysslor och aktiviteter behöver ha möjlighet att sätta start och slutdatum
- [x] Månadsvy i tablet visar delad layout: kalender vänster + dagdetaljer höger
- [x] Veckans navigering (WeekNav) är gemensam komponent för kalender och meny
- [x] Sysslor ger nu ljuslila färg på dagar i månadsvy
- [x] Kunna lägga aktiviteter på users
- [x] Kunna filtrera på user i sysslor och kalendern
- [x] Kunna trycka på aktiviteter för att se mer info (beskrivning, plats, påminnelse mm)
- [x] Få upp en datepicker när man trycker på veckonumret istället för att hoppa till dagens datum
- [x] Flytta in "Idag"-knappen lite mer så att man inte råkar trycka på den av misstag (gäller även i menyn)
- [x] i datepickern borde veckonumret stå till vänster, typ "17" i ljusgrått eller liknande
- [x] Sista raden i månadsvyn blir konstig med bara 1 eller 2 dagar. Borde fylla upp med nästa månads första dagar precis som på första raden med föregående månads sista dagar. Samma i datepickern.
- [x] Möjlighet att växla mellan månadsvy och veckovy i tablet-format
- [x] heldagsaktiviteter borde ligga ovanför tidsbestämda aktiviteter på dagar
- [x] filter i kalendern borde bara visa färg på dagar där usern har aktiviter/sysslor som är filtrerad. Funkar inte!
- [x] Aktiviteter som har passerat (i tid) borde strykas över eller gråmarkeras
- [x] En privat aktivitet i kalendern borde kanske inte kunna läggas på någon user
- [x] Skapa ny aktivitet behöver inte ha "Dag"-valet med veckodagarna då den bör komma ihåg vilken dag man valt att lägga in aktiviteten på.
- [ ] Kunna lägga aktiviteter på fler än en user i taget

### Sysslor
- [x] Hela namnet på user syns fortfarande inte helt ("Joaki" -> "Joakim"). Funkar dock i aktivitet så något är annorlunda där.
- [x] Kunna redigera sysslor enklare (med en penna till höger)
- [ ] Skapa syssla dialogen borde se mer ut som aktivitetsdialogen med Upprepning och även möjlighet att välja en specifik dag som sysslan ska utföras på.


---

## Agent
- [ ] en AI-agent som tränar på att identifiera basvaror, vad som är måttenhet och rätt kategori när den importerar recept.
- [ ] kanske en agent som lär sig hur användaren brukar lägga till basvaror, aktiviteter etc för att få en bättre UI experience?
- [ ] Identifiera storleksordning på mått så att den alltid går på det största måttet när den ska slå ihop samma vara

---

## Ej helt färdiga stories, idéstadie
- [ ] Borde finnas underkategorier till varukategorierna som varorna också tillhör (chark, ost, deli, kött, fågel, korv, fisk, allergi, glass, alkoholfritt, chips, etc) så att man om man vill kan slå isär en huvudkategori om det inte matchar affären
- [ ] Eventuellt möjlighet att kopiera en veckomeny till en annan vecka
- [ ] Veckovyn i tablet borde kanske se likadan ut som i mobilen med allt under?
- [ ] ha en sökbar databas på butiker som andra lagt till för att på så vis slippa skapa butiker som redan finns inlagda. Kanske ett premium-alternativ?
## Backlog (prioriterade features)

### Kalender

- [x] **Månadsvy på tablet** — Visa hela månaden som grid i kalender-fliken när skärmen är tillräckligt bred
- [x] **Redigera/ta bort events** — Tryck på event öppnar edit-modal. Ta bort-knapp. (Maträtt-event bör navigera till Meny, syssla-event till Sysslor)
- [x] **Upprepade events (serier)** — Välj upprepning när man skapar aktivitet: dagligen, varje vecka (med veckodagscheckboxar), månadsvis (dag X eller N:e veckodag), årsvis 
- [x] Möjlighet att ta bort enstaka vs hela serien
- [x] Möjlighet att redigera enstaka tillfälle vs hela serien
- [x] Intervallstepper "var X dag/vecka/månad/år"
- [x] Slutvillkor: upphör aldrig / välj slutdatum
- [x] Start- och slutdatum för återkommande aktiviteter och sysslor

### Sysslor

- [x] **Flera dagar per syssla** — Kunna välja t.ex. mån, ons och lör i samma syssla (idag är det bara en dag). Spara som array av WeekDay
- [x] **Klarmarkera och redigera** — Bocka av syssla likt inköpslistan (inline, inte bara via "slutför"-knapp). Redigera titel, frekvens, dag, person. Avklarade sysslor stryks över i kalendervy

### Meny

- [x] **Sortering mån→sön + tydlig dagmarkering** — Veckans meny sorteras kronologiskt. Varje dag har tydlig rubrik (Måndag 5 maj). Ej schemalagda visas sist
- [x] **Varning vid dubbel dag** — Om det redan finns en maträtt på en dag varnas användaren (men kan ändå lägga till)
- [x] **Datepicker för annan vecka** — Möjlighet att planera meny för valfri vecka, inte bara innevarande
- [x] **Smarter "till inköpslistan"** — Om maträtten redan är tillagd i aktiv inköpslista visas inte "till inköpslistan". Vid borttagning visas "ta bort från inköpslistan" om den finns där

### Inköpslistan

- [x] **Deduplicering av ingredienser** — Samma ingrediens (samma namn + enhet) adderas ihop vid transfer från meny istället för att bli dubbletter. (Delvis fixat för transfer, men kolla manuella tillägg också.)

### Inställningar

- [x] **Redigera hushåll** — Admin kan ändra hushållets namn. Se och ta bort medlemmar. Sätta smeknamn på sig själv
- [x] **Flera hushål** — Skapa och växla mellan flera hushål under inställningar (t.ex. eget + sommarstugan). Aktivt hushål sparas i context
- [x] **Profiler utan konto** — Skapa lokala profiler för barn/personer utan Clerk-konto. Kan tilldelas sysslor och chorer utan att logga in
