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
- [x] Ännu större font och knappar/pilar mm i tablet-vyn. Idag ser de nästan mindre ut än i mobilversionen.
- [x] sysslor och aktiviteter skulle kunna ha en emoji likt maträtter för att få samma stil på korten i kalendern.
- [x] Ångra-toast för destruktiva åtgärder (rensa inköpslista) — knapp "Ångra" i toasten i ~5 sekunder (resten kan adderas vid behov)
- [x] Utvidga realtidsuppdatering (WebSocket) till sysslor och kalender (meny + inställningar kan adderas via samma kanal) — meny nu tillagd: backend sänder `menu_updated` (vecka) på hushålls-kanalen vid add/ändra/ta bort/kopiera/applicera-mall; meny-fliken debounce-laddar om så andra enheter ser ändringen direkt
- [x] Long press-symmetri: kontrollera att redigering via long press finns konsekvent på basvaror, butiker och kategorier (inte bara inköpslista/maträtt/aktivitet/syssla)
- [x] Pushnotiser — infrastruktur (blockerare för notistyperna nedan): permission-flöde, token-registrering, notis-inställningssida med på/av per typ
- [x] Pushnotiser — specificera per typ: påminnelse innan aktivitet startar, förfallen syssla, någon har rensat aktiv inköpslista, ny medlem i hushållet (kräver ny eas build för native-modulen)
- [x] Felhantering vid misslyckad optimistisk uppdatering — om backend-anropet failar efter att UI redan flyttat/skapat något: rulla tillbaka ändringen och visa "kunde inte spara — försök igen"-toast (annars tyst desync mellan enheter)
- [x] Konsekventa tomma tillstånd (empty states) på alla flikar — vänlig "inget här än" + CTA första gången en ny medlem öppnar meny/sysslor/kalender utan data
- [x] Bannern ovan appen borde vara svart/neutral så man ser klockan, notiser mm
- [x] Flertal ställen i appen när inputfälten fortfarande inte hoppar upp ovan tangentbordet. Säkerställ att alla inputfält har rätta beteendet
- [x] Samma filter borde gälla över sysslor som kalender så att man inte blir förvirrad vad som är filtrerat för de olika flikarna
- [x] Pending-removal visual state: under ångra-fönstret (5s) ska varor/recept som håller på att tas bort visas med fade + strikethrough + liten "(tas bort om Xs)"-tag istället för att försvinna direkt eller poppa tillbaka vid ångra
- [x] Toast-kö vid bulk-borttagning: om flera recept tas bort i snabb följd skriver toasten över sig själv. Stacka eller visa "3 recept tas bort om 5s · Ångra"
- [x] Re-merge feedback: när auto-merge slår ihop kvarvarande varor efter borttagning (t.ex. 3 ägg → ta bort 1 → 2 ägg), visa toast "Slog ihop {n} {namn}" så användaren förstår grupperingen
- [x] Kunna swipa mellan veckor i kalender och meny-fliken
- [x] Eventuellt ersätta longpress med en redigeraknapp alt att man bara kan ta bort/byta namn inuti kortet på "3 prickar" (meny: redigera/ta bort/byt ut i utfällt kort, inte via longpress)
- [x] Istället ha longpress för att sortera/flytta om (meny: longpress = endast dra/flytta)
- [x] Konflikthantering vid realtidsuppdatering — om två personer redigerar samma vara/aktivitet samtidigt: last-write-wins + toast till den som blir överskriven så ändringar inte tappas tyst (har man en vara/aktivitet/syssla öppen för redigering och någon annan ändrar den via realtid → gul inline-banner högst upp i dialogen "{namn} ändrade {posten}" med knapp "Visa senaste" som icke-destruktivt fyller i de inkomna värdena (toast funkar ej i dialog — RN Modal ligger ovanpå); tas posten bort stängs dialogen + toast "{namn} tog bort {posten}". Aktör-namn skickas med i socket-payloaden (actor) från backend. Gäller inköpsvaror, aktiviteter, kalender-sysslor och sysslor-fliken. Last-write-wins kvarstår vid spara)
- [x] Uppdateringar från socket borde uppdatera andra flikar innan man trycker på dem så att det inte hoppar till. Just nu kan det stå "0 av 0 kvar" och sedan hoppar det till -> "21 av 21 kvar" (backend sänder shopping_list_updated på hushålls-socketen; översikten lyssnar + debounced reload)
- [x] Vecko-rubriken borde vara lila för alla veckor (inte bara nuvarande) i kalendern och menyn
- [x] Trycka på en notis så borde man hamna på det berörda stället (notis-tap routar nu: aktivitetspåminnelse → kalendern, förfallen syssla → sysslor, rensad lista → den specifika listan, ny medlem → inställningar; gäller både tap i appen och kallstart. Att öppna exakt post-dialog (just den sysslan) är en framtida förfining)
- [x] Notis-tap: öppna exakt post-dialog (entryId → aktivitetens redigering, choreId → sysslans) istället för bara rätt flik (routing skickar med id som param; kalender/sysslor läser parametern och öppnar postens redigeringsdialog när datan laddats, sen rensas paramen)
- [x] Onboarding: välkomstskärm vid första app-start — "Välkommen till Veckis, här följer lite tips och trix" + "Fortsätt"/"Jag är fullärd" där det andra valet inaktiverar alla framtida tips via master-flaggan
- [x] Onboarding: tip-kortet beskär innehållet — innehållet ligger nu i ScrollView med maxHeight 70% av skärm
- [x] Onboarding: spotlight-hålet har nu en statisk lila border (alltid synlig) + en pulserande overlay-ring för emphasis — tydlig gräns även när pulsen är på sin låga punkt
- [x] Onboarding: dim-overlay mörkad från rgba(0,0,0,0.55) till 0.82 så underliggande UI inte är läsbart genom dim:en
- [x] Onboarding (meny): meny-nav-tipset visar nu drag-animering (pulserande long-press + diagonal förflyttning) via swipeDemo: 'drag' i SpotlightTip; renderas centrerat ovanför tip-kortet
- [x] Onboarding (kalender + meny): WeekNav-date-tipset ringar nu bara in veckonumret-texten (separat ref runt Text), inte hela WeekNav-raden
- [x] Onboarding (kalender): nytt `seen-calendar-origins-tip` förklarar att maträtter kommer från meny-fliken och sysslor från sysslor-fliken
- [x] Onboarding (kalender): action-tip på "+"-FAB (`seen-calendar-add-tip`) som förklarar återkommande/vem/påminnelse vid första tryck
- [x] Onboarding (sysslor): nytt `seen-chores-intro-tip` förklarar fliken ("strukturera återkommande sysslor — prova roterande schema") vid första focus, oberoende av om det finns sysslor inlagda
- [x] Onboarding (sysslor): forgiving-tipset omformulerat till "Historik per syssla" med fokus på utfälld vy (klar/missad) istället för "Inga fler påminnelser..."
- [x] Onboarding (recept): sort-tipset borttaget; ersatt med action-tip på "+"-FAB (`seen-recipe-add-tip`) som förklarar "skapa eget eller importera URL"
- [x] Onboarding: "Återställ alla tips"-knapp tillgänglig i prod via 3-prickar-meny i inställningar (tidigare bara `__DEV__`)
- [x] Onboarding: master-toggle "Visa onboarding-tips" + reset i 3-prickar-overflow på inställningssidan; styr `onboarding-skip-all`-flaggan som blockerar alla tips
- [x] Onboarding: `useFirstActionTip(flagKey)`-hook wrappar en onPress och fyrar tip vid FÖRSTA knapptrycket. Använd för "+"-knappar och liknande där mount-tips skulle bli irrelevant. Mount-tips behållna för icke-uppenbara funktioner (swipes, long-press)
- [x] Onboarding (inköp): action-tip på "+"-FAB (`seen-shopping-add-tip`) som förklarar butikskoppling + meny-överföring
- [ ] möjligt med horisontell-vy i tablet
- [ ] Tillgänglighet: allt som nås via long-press ska även ha en synlig knapp + accessibility-labels på ikonknappar (penna/x/dubblett) så VoiceOver/TalkBack fungerar (delvis: navigations-/åtgärds-ikoner har labels — WeekNav-pilar, tillbaka-knappar, 3-prickar, kundvagn-FAB; kvar: penna/x/dubblett i listraderna + filterknappar)
- [ ] Ljud för toasts eller liknande. Avcheckning inköpslistan eller överföring av meny
- [ ] Städa upp legacy-kod
- [ ] Refaktorera och skapa fler filer för egna komponenter mm
- [x] Backend integration-tester — vitest med isolerad test-DB (`veckis_test`) + truncate-per-test för deterministisk state. Setup-fil med säkerhetsspärr (kräver `veckis_test` i URL:n). Tester täcker: medlem-borttagning rensar assignedToMany på chores + scheduleEntries, orphan-count räknar både fält (3 tester); chore create/update med syncAssignedTo, rotation cyklar deterministiskt på completions.length, cascade-delete av completions (5 tester); shopping item auto-inferrar subCategory + category, mergedIntoId-filter döljer underordnade rader vid GET/PATCH, "jag handlar"-presence, store-konfig defaults + expandedSubs persistens (8 tester). 76 → 108 gröna tester.
- [ ] Frontend test-infra (vitest + react-native-testing-library) — `app/` saknar test-setup helt. Sätt upp + täck minst: MultiMemberPicker (chip-toggle + rotation-row dyker upp vid 2+), filter-/sort-logiken i sysslor (buildAssignedLabel, performer-picker-beslutsträd, "min tur"-filter), SpotlightTip-gate (welcomeReady/skipAll). Pure-functions först (lättast), sen render-tests för key-komponenterna.
- [ ] Designpass — visuell konsekvens i ett svep (kräver visuellt omdöme, görs bäst samlat): (a) **skuggor på kort** är inkonsekventa genom hela appen; (b) **dialog-rutor** ska vara rundade upptill och inte genomskinliga nedtill — butiker, filter, veckomenymallar och notiser saknar rundade hörn upptill (audit: alla sheets är redan rundade upptill, paddingBottom-variansen är strukturell, och de grå modalerna MenuTemplatesModal/NotificationsModal är ev. avsiktligt grå); (c) **grönt passar dåligt mot skuggan**.
- [x] Migrera alla `Alert.alert` till nya `ConfirmDialog`/`useConfirm`: 62 av 62 klara. Sista omgången migrerade settings (6), schedule (6), MenuTemplatesModal (2), household/setup (2), sign-in/up (4). Kopierat-/bekräftade info-toast:as nu istället för att öppna en alert. Alert-importerna städade i 6 filer.
- [ ] Fixa en snygg app-logga

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
- [x] inställningar uppdateras inte automatiskt för alla användare när någon gör ändringar.
- [x] Varna innan man tar bort en lokal profil/medlem som har tilldelade sysslor/aktiviteter ("X har 4 sysslor och 2 aktiviteter — vad ska hända med dem?") istället för tyst orphaning
- [x] tydligare indikera vem som är jag (Du) i medlemmar
- [x] Notisinställningar uppe till höger som en klocka istället
- [x] Sätt admin-loggan bredvid "Admin" för admins under Medlemmar


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
- [x] Automatiskt slå ihop ingredienser av samma typ och måttenhet vid import (recept med menuItemId mergas nu med existerande oberoende vara av samma namn+enhet)
- [x] När man byter enhet på en basvara läggs den till under kategori istället för att ersätta den gamla så att man får dubbletter. Bättre att den bara uppdaterar enheten istället.
- [x] Redigera vara borde se likadan ut som lägga till ny vara-vyn (förutom att man ska kunna redigera varunamnet).
- [x] Ny varuvyn borde komma upp även när man lägger in vara manuellt i inputfältet
- [x] Enheter har stor bokstav i dubblettvyn.
- [x] Enhetsfältet syns inte när man får upp tangentbordet i enheten för dubblettdialogen
- [x] möjlighet att redigera felinskriva basvaror genom att longpressa på sökförslaget
- [x] optimistisk uppdatering vid redigering av varor
- [x] tangentbordet hoppar inte upp vid redigering av varor
- [x] automatiskt sammanslå varor med samma enhet efter redigering
- [x] kunna skapa egna kategorier samt kunna dölja/lägga till kategorier man vill ha
- [x] Möjlighet att fälla ihop kategorier i inköpslistan genom att trycka på kategorinamnet
- [x] toast vid lyckad ihopslagning av dubbletter
- [x] Lyft de mest använda basvarorna överst ("dina vanligaste") när man lägger till varor, så återkommande inköp går snabbare
- [x] Ihopslagna ingredienser borde gå att ångra via toasten
- [x] Efter ihopslagning och flytt till nästa dubblett borde tangenbordet försvinna
- [x] Kanske det krävs att en vara blivit tillagd mer än 1 gång för att återfinnas i söket. Ett sätt för en felstavad eller inskriven basvara av misstag att inte komma med i söket (staple-söket kräver usageCount >= 2; kurerade ingrediensförslag täcker ändå vanliga namn)
- [x] Inköpsfliken rendar inte om när man tar bort en maträtt från menyn utan att man byter flik eller uppdaterar sidan
- [x] Dubbletter: Enhetsfältet skymt när man klickar i enhet (vid fokus mäts mängd/enhet-radens position mot tangentbordets topp och listan scrollas exakt så raden hamnar precis ovanför tangentbordet; ihopslagnings-knapparna (utanför scrollytan) göms medan tangentbordet är uppe så de inte flyter ovanför det och äter höjd)
- [x] "Jag handlar"-läge: ny ShoppingList.activeShopperMemberId + activeShopperSince. PATCH /shopping/lists/:id/shopper claim:ar/släpper. Broadcasts på både list- och hushållskanalen så list-detalj och översikt uppdaterar i realtid. 3-prickar-menyn växlar status + lila banner i list-headern + "X handlar"-pill på översiktskorten. Auto-rensar när listan rensas.
- [x] Butiker som recept-vyn: ny /stores route med sök, sortera (A-Ö/tilläggsordning), kortvy + FAB. Långtryck/penn-knapp för byt namn + ta bort. Tap → kategori-editor i bottom-sheet. Knappen "Butiker" i inköpsfliken navigerar dit.
- [x] Kategorier — 2-nivå-taxonomi (story-headline; sub-punkter 1-6 klara, 7-9 väntar på beroenden). Idag har vi `category` (parent enum) + ad-hoc `customCategory: string`-override per vara och `customCategories: string[]` per butik. Custom-strängar förstör cross-household-data: "ost" blir olika sak i olika hushåll → AI-träning, central databas och statistik tappar grepp. Ny modell: standardiserade sub-kategorier (40-60 enum) under parents (10-12). Sub är källa-till-sanning; parent härleds vid skapande från sub:ens defaultParent men kan editeras per item.
- [x] Kategorier — definiera taxonomin: ny `SubCategory`-enum med ~50 värden i `shared/lib/taxonomy.ts`. Lookup-tabell `SUB_TAXONOMY[sub] = { defaultParent, alsoUnder }`. Sub har EN default-parent (många-till-många bor bara som info i taxonomin för konfigurations-UI:t).
- [x] Kategorier — datamodell: `ShoppingItem.subCategory: SubCategory | null` läggs till; `category` (parent) bevaras och defaultar till sub:ens defaultParent vid skapande men kan override:as per item. `customCategory` deprekeras (dold i UI, kvar i schema för migration). Prisma-migration + zod + shared-typer.
- [x] Kategorier — recept-import & autocomplete (inferSubCategory-helper med 250+ keyword-patterns; word-boundary-matching med Unicode-stöd; backend POST /items auto-inferrer subCategory om kallaren inte skickar) fyller i båda fälten: skrapern och autocomplete-förslagen mappar mot subCategory + härleder defaultParent. Bättre datakvalitet från start.
- [x] Kategorier — butikskonfig (Store.expandedSubs + UI i /stores/[storeId] med fäll-ut per parent + toggle per sub; buildCategoryGroups renderar expanderade subs som egna sektioner direkt efter sin parent): under varje parent i `/stores/[storeId]`, fäll ut för att visa relaterade subs. Per sub: toggle "samla under parent" (default) eller "egen sektion". Konfigen styr BARA rendering; inga item-mutations.
- [x] Kategorier — per-item override (item-editorn har sub-chips filtrerade på valt parent; editSubCategory-state hydreras + skickas till backend tillsammans med editCategory): long-press vara → "Redigera" → byt parent + sub oberoende av varandra (även avvika från taxonomins default). Båda är full radio-pickers över respektive enum.
- [x] Kategorier — migration (backend/jobs/backfillSubCategory.ts kör vid start; försöker matcha customCategory-strängen först sen item.name via inferSubCategory; idempotent. Schema-cleanup av customCategory-fältet återstår tills alla items konverterats): string-similarity-matchning av befintliga `customCategory`-strängar mot bästa sub. Träff över threshold → auto. Resten flaggas för manuell granskning i admin-vy. När alla items konverterats: ta bort `customCategory`-kolumnen + `Store.customCategories`.

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
- [x] Man måste kunna inventera (checka i ingredienser) vad man har hemma innan man överför maträtten till inköpslistan.
  skapa nytt recept-vyn
- [x] när man lägger in nytt recept borde man få förslag när man börjar skriva in ingredienser typ ("ban" -> "banan") likt när man lägger till basvara i inköpslistan
- [x] När man överför ingrediensern med shopping-carten direkt i ett recept borde det inte gå att välja någon lista om ingen ingrediens är vald
- [x] När man överför ingredienser direkt med shopping-cart funktionen blir det en spinner på alla inköpslistor istället för den man tryckt på. Och istället för en toast blir det en dialog vilket inte följer resten av designen
- [x] Flytta ingrediensnamnet så att det kommer först i nytt recept, så att man först skriver in ingrediensen, sedan mängd och sist enhet
- [x] Hela rubriken "Originalrecept" syns inte inuti ett recept. Bara "Originalrecep"
- [x] Ha en border under veckodagen som motsvarar en yta för maträtten samt ett "+" i mitten. När man flyttar rätter mellan dagarna borde den bara flytta mellan borders (inte runt veckodagens namn)
- [x] Receptimport-robusthet: fallback "kunde inte läsa receptet — lägg till manuellt" vid URL som failar, recept utan ingredienslista eller dubbel-import
- [x] Veckomeny-mallar: spara en vecka som mall ("Standardvecka") och applicera den på valfri vecka
- [x] Inventering vid veckomeny → inköpslista görs om: hopslagen lista (en rad per ingrediens över alla valda rätter, med härkomst) istället för en rätt i taget, så delade varor (krossade tomater, lök, grädde) inte dubbelcheckas. Lägesväxel "Bocka av" / "Ange mängd" — i mängdläget räknas bristen ut och bara den överförs. Bristen apportioneras tillbaka per rätt så merge/borttagning funkar.
- [x] Swipar man mellan menyer byter rätter som ligger på samma dag plats (hoppar till)
- [x] Kunna lägga till maträtter direkt från recept-knappen --> (välj dag)
- [x] Lägga till recept skulle då kunna leda direkt till samma receptdialog (men där veckodagen skickas som parameter)
- [x] Lägga till nytt recept: enhet borde föreslå i grått den enhet som väljs oftast, och klickar man inte i det fältet så borde den enheten väljas automatiskt (enhetsfältet visar hushållets vanligaste enhet som grå placeholder; väljer man en känd ingrediens fylls dess vanliga enhet i automatiskt)
- [x] Lägga till nytt recept: enhetsfältet hoppar inte upp igen om man valt en enhet och trycker i fältet igen (onPressIn återvisar enhets-chipsen vid återklick)
- [x] Enhetsfältet i ingrediens-redigering scrollade alltid uppåt vid fokus (knuffade tillslut bort inputen) — scrollar nu bara om fältet/chip-raden hamnar under tangentbordet
- [x] Ingrediensnamn/enhet-fälten triggade OS-autofill ("id:n och lösenord") — autofill/förslag avstängt (textContentType none, autoComplete off, importantForAutofill no)
- [x] Samsung Pass visar fortfarande "id:n och lösenord"-autofyll på TOMMA nya ingrediens-rader (respekterar inte importantForAutofill via JS). Native-fix: config-plugin sätter android:importantForAutofill=noExcludeDescendants på activity (aktiveras vid nästa EAS-build; stänger även av autofyll på login-fälten)
- [x] Varna om man byter ut maträtt till dubblett eller lägger till maträtt från recept på en dag som redan har en planerad maträtt
- [x] Bättre med optimistik uppdatering av menyn när man tar bort ett recept än att det blir en delay — kortet döljs direkt (render filtrerar pending-objekt), commit sker efter 5s och ångra-toasten återställer; stacking bevarad
- [x] När man lägger till recept borde man även få val att också lägga till beskrivning och instruktioner
- [x] Gråa ut dagar som redan har en maträtt när man kommer till "Lägg till i meny" dialogen
- [x] "Ingen dag" valet ser inte valbart ut i "Lägg till i meny"-dialogen
- [x] "Ta bort recept" i receptets 3-prickar-meny (idag bara via listans redigeringsläge)
- [x] Visa receptbild (imageUrl) överst i receptvyn
- [x] Riktig bilduppladdning för recept (välj från kamera/galleri → ladda upp till lagring → imageUrl) i stället för att klistra in en bild-URL (Cloudinary som lagring; multer-endpoint `POST /api/recipes/:id/image`; frontend ersatte URL-fält med Galleri/Kamera-knappar + preview, lokal resize till 1200px + JPEG-komprimering före upload; eager transformation cap:ar lagrat till 1600px + auto-format/quality vid leverans. Kräver Cloudinary-konto + env-vars + ny EAS-build pga native-moduler.)
- [x] Inventeringsdialogen går inte hela vägen ned (inventeringslistans höjd capades till fast 400px → på korta skärmar trängdes Överför/Tillbaka-knapparna ut under sheetens maxHeight 80%; höjden är nu skärmhöjds-medveten så knapparna alltid får plats)
- [x] Persistera portionsskalning per menyrätt: skalningen (−/+ på menykortet) sparades bara i lokal state → tappades vid reload och syncade inte mellan enheter. Nu sparas `servings` på WeekMenuItem (fält + migration), PATCH:as debounced vid skalning (null = recept-default), och getScaleRatio/inköpsöverföringen läser det persisterade värdet. menu_updated-broadcasten gör att andra enheter laddar om med rätt portioner.
- [x] Möjlighet att kopiera en veckomeny till en annan vecka (backend endpoint, UI återstår)
- [ ] ⚠️ KOM IHÅG: `withDisableAutofill`-pluginen stänger av autofyll app-brett. Om/när vi gör en riktig inloggning med lösenord (där lösenordshanterar-autofyll är önskvärt) måste pluginen tas bort ur app.json (+ ny EAS-build), alternativt göras mer riktad så bara recept-fälten exkluderas.


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
- [x] Kunna lägga aktiviteter på fler än en user i taget
- [x] Lägga tider ute till höger på aktiviteter
- [x] Datepickern borde visa datumet man är på och väljer man ett datum i datepickern borde kalendern uppdatera så att det är den dagen som väljs i veckovyn
- [x] Använda samma veckonummer-bar som i menyfliken (kalenderns WeekNav visar nu "Vecka {nr}" utan år, som menyn)
- [x] Idag-knappen hoppar inte till rätt dag (endast rätt vecka)

### Sysslor
- [x] Hela namnet på user syns fortfarande inte helt ("Joaki" -> "Joakim"). Funkar dock i aktivitet så något är annorlunda där.
- [x] Kunna redigera sysslor enklare (med en penna till höger)
- [x] Skapa syssla dialogen borde se mer ut som aktivitetsdialogen med Upprepning och även möjlighet att välja en specifik dag som sysslan ska utföras på.
- [x] När man skapar en syssla blir det en dubblett
- [x] Checkar man av en syssla uppdateras det inte automatiskt på en annan enhet
- [x] Skapa/redigera syssla-dialogen borde vara större så man ser alla fälten. Tilldela person fältet borde ligga ovanför Frekvens.
- [x] "Återkommande"-knappen borde inte byta namn när man klickar på en återkommande frekvens
- [x] Man borde kunna sätta ett valfritt datum även för en "engångs-syssla"
- [x] Avklarade sysslor borde hamna underst i listan. Den gröna bakgrunden är lite överflödig för avklarade sysslor
- [x] Förlåtande återkommande sysslor (ingen skuldhög): ett förfallet tillfälle är åtgärdbart i ett grace-fönster (till nästa tillfälle) — kan klarmarkas i efterhand inom fönstret; därefter auto-stryks det tyst som "missad" (inga fler påminnelser), och notisen för förfallen syssla skickas en gång per tillfälle (inte upprepat). Återkommande syssla kan fällas ut och visa diskret historik (✓ klar / – missad) för senaste tillfällena. Fokus i listan = vad gäller nu/härnäst, inte en backlog av missat. (V1 byggd: occurrence-status via occursOn, inline-klarmarkering av aktuellt tillfälle, utfällbar historik, ingen "färdig"-look på återkommande, skuldfri notis-ton)
- [x] Onboarding-tips för dolda funktioner via `useOnceFlag`-hook + `SpotlightTip`-komponent: dimmar bakgrunden och ringer in mål-elementet med en pulserande ram (eller centrerad ruta om inget mål). Modal renderas utan `statusBarTranslucent` så koordinaterna matchar `measureInWindow` (ringen ligger rätt). `showTip` returnerar boolean — om ett annat tip redan visas blir det `false` och `markSeen` skippas så tipset försöks igen senare (förhindrar att tips trampar på varandra). Tips visas en gång per device, utan delay (annars hinner användaren trycka något annat). 14 tips klara: forgiving (sysslor), menu-nav (meny), merge (inköp, target), templates (meny, target), cart-fab (meny, target), list-actions (inköp, target), sort (recept, target), weeknav-date (kalender+meny via WeekNav, target), filter (kalender+sysslor delar flagga, target), notif-clock (inställningar, target), drag-merge (inköp), recipe-cart (receptdetalj, target), admin (inställningar, target, bara för admins, efter notis-tip), stores (inköp-fliken, target).
- [x] "Klart av {namn}" på delade sysslor: utfällda historiken visar vem som bockade av varje tillfälle (preferera performedBy-medlemsnamn, annars completedBy via Clerk→medlemsnamn). När sysslan är tilldelad en lokal profil (som inte kan logga in) får den som trycker Klar **välja vem som faktiskt utförde** (lokal profil eller "jag"), så krediten hamnar rätt — nytt `performedByMemberId`-fält på `ChoreCompletion`. Push-notis till övriga vid avbockning är en framtida utbyggnad.
- [x] Flera medlemmar per syssla + valbar rotation: 11 sub-punkter klara (datamodell, backend-logik, editor, kort, performer-picker, filter, edge cases, realtid, historik tur-vs-utförare, "min tur"-filter, rotation-tip). Implementation: assignedToMany + rotation på Chore, computeCurrentTurn-helper i @veckis/shared, turn flyttas vid completion (inte missar) — deterministisk så backend + frontend räknar lika.
- [x] Sysslor – datamodell: ny Prisma-migration lägger `assignedToMany String[]` + `rotation Boolean` på Chore (assignedTo behålls för bakåtkompatibilitet och hålls i sync via syncAssignedTo). Backfill: alla rader med assignedTo='X' fick assignedToMany=['X']. Shared-types och create/update-zod uppdaterade.
- [x] Sysslor – backend-logik: notification-fan-out implementerad (push till alla i assignedToMany vid rotation=false; bara turperson vid rotation=true). computeCurrentTurn-hjälpare i @veckis/shared så backend + frontend räknar samma turn deterministisk från completions.length.
- [x] Sysslor – editor: MultiMemberPicker ersätter MemberPicker. Chip-toggle per medlem; rotation-checkbox dyker upp när 2+ valda med inline-mikroforklaring.
- [x] Sysslor – syssla-kort: ny buildAssignedLabel-helper visar rotation="Annas tur · Nästa: Bo" eller flera namn separerade med "·" utan rotation. (Avatar-stack ej implementerad — text-baserat räcker just nu.)
- [x] Sysslor – performer-picker: vid rotation=true visas turpersonen överst med "(tur)"-suffix; hela tilldelade listan + "jag" valbara för överstyrning. Skippas fortfarande för enskild Clerk-user utan rotation.
- [x] Sysslor – filter-konsistens: chores-filter i sysslor + kalender matchar nu memberId mot assignedToMany (med legacy assignedTo som fallback). Symmetri med aktivitets-filtret.
- [x] Sysslor – edge cases: medlem-borttagning rensar id:t från alla chores/scheduleEntries' assignedToMany i transaktion innan radering. Orphan-count räknar både assignedTo och assignedToMany. Lokala profiler behåller passiv-roll.
- [x] Sysslor – realtidsuppdatering av rotation: redan automatiskt löst — chore_completed-broadcasten lägger till en completion på alla enheter och computeCurrentTurn räknar deterministiskt om från completions.length. Ingen extra payload behövs.
- [x] Sysslor – historik visar tur-vs-utförare: utfälld historik räknar fram turn per occurrence (done-count flyttar turen, missade gör inte). När performer ≠ turperson visas "Anna (hoppade in för Bo)". Missade tillfällen visar "Bo missade".
- [x] Sysslor – "min tur"-snabbfilter: ny chip "Min tur" bredvid Filter-knappen, visas bara när hushållet har en eller flera roterande sysslor. När aktiv visas sysslor där jag är aktuell turperson (eller där rotation är av men jag är med).
- [x] Sysslor – rotation-action-tip: när användaren har 2+ medlemmar valda i editorn (i create eller edit) fyrar "Turas om automatiskt"-tipset en gång (seen-rotation-toggle-tip) som förklarar toggle:n.



---

## Agent
- [x] Identifiera storleksordning på mått så att den alltid går på det största måttet när den ska slå ihop samma vara (helper + tester, integration återstår)
- [ ] en AI-agent som tränar på att identifiera basvaror, vad som är måttenhet och rätt kategori när den importerar recept.
- [ ] kanske en agent som lär sig hur användaren brukar lägga till basvaror, aktiviteter etc för att få en bättre UI experience?
- [ ] Bli ännu smartare på ihopslagning av dubbletter. Så att den förstår att 400 g + 1 paket --> 2 paket istället för 401 g etc.

---

## Ej helt färdiga stories, idéstadie
- [ ] Kategorier — skafferi-minne får exakt matchning på subCategory (bygger på #283 nedan): "ost" i skafferi matchar bara items med subCategory='ost', inte hela mejeri-kategorin. Kräver att taxonomi-bygget är klart.
- [ ] Kategorier — söklogik prioriterar subCategory-träff: sök "smör" matchar items med subCategory='smör_margarin' före LIKE-träff på name. Bygger på taxonomi.
- [ ] Kategorier — koppla datakvalitet-städningen (rad 282 nedan) till sub-merge: admin-vy kan slå ihop duplicat-skapade subs eller mappa om ärvda customCategory-strängar.
- [ ] Veckovyn i tablet borde kanske se likadan ut som i mobilen med allt under?
- [ ] ha en sökbar databas på butiker som andra lagt till för att på så vis slippa skapa butiker som redan finns inlagda. Kanske ett premium-alternativ?
- [ ] Statistik/insikter: lättviktsvy med "mest lagade rätter", "vem gör flest sysslor", "vanligaste inköp" — möjligt premium-läge tillsammans med butiksdatabasen
- [ ] Datakvalitet-städning: admin-vy för att slå ihop/städa basvaror & kategorier så normaliserade namn och delade kategori-minnen inte driftar över tid
- [ ] Skafferi-minne: persistent "har hemma" som minns över sessioner (eget skafferi per hushåll) så återkommande basvaror inte behöver inventeras varje gång. Bygger vidare på den hopslagna inventeringen.
- [ ] Utnyttja större skärm likt kalender-vyn att saker öppnas bredvid istället för under mm.
- [ ] bygga en pwa
- [ ] Streckkodsläsare för att direkt lägga till en vara — **utredd & nedprioriterad**: OpenFoodFacts (enda realistiska gratis-källa) testad manuellt på vanliga svenska/butiks-egna varor (ekologiskt äppelmos, soltorkade tomater, bostongurka) → ingen träff. Täckningen är god för internationella märkesvaror men svag där svenska hushåll faktiskt handlar. Scannern skulle hjälpa exakt där OFF är svagast och är överflödig där OFF är stark (vanliga repeaters klaras redan av autocomplete + stapleItems). Native-modul + EAS-build + scan-UI + error-states bedömt inte värt det. Återupptas om en bättre datakälla dyker upp (t.ex. svensk butikspartnerskap eller paid API med bra svensk täckning).
- [x] Skrapa även tillvägagångssätt/instruktioner vid recept-import (URL) och fyll i instructions-fältet automatiskt (parseInstructions flattenar JSON-LD recipeInstructions — sträng/array/HowToStep/HowToSection — till numrerade rader; from-url returnerar instructions och receptet skapas med dem)
- [x] Populära/senast använda recept överst i "välj rätt"-läget (likt "Dina vanligaste" i inköp) — sorter-knapp i recept-headern med radioval: A–Ö / Mest använda / Senast tillagda; valet sparas (gäller även välj-läget). "Mest använda" = livstidsräknare Recipe.timesUsed som ökar varje gång receptet läggs i en meny (backfilld från nuvarande förekomster)
- [ ] Spåna mer på inventeringsdelen då det blir lite orent med bocka av/Ange mängd..
- [ ] Radikalt alternativ för återkommande sysslor: flexibelt intervall per syssla — nästa förfallodag räknas från när man senast gjorde sysslan ("var 3:e dag" från senaste utförandet) istället för fast kalender. Ingen förfallet-hög alls; passar rytm-sysslor (vattna/dammsuga), sämre för fasta dagar (sopor på måndag). Skulle vara ett val per syssla: "fast dag" vs "ungefär var X:e dag". (Subsumerar tidigare "klarmarkera bakåt"-idén — täcks nu av förlåtande-modellen i Sysslor-sektionen.)

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

### iOS

All JS-kod är plattformsneutral (Expo/RN) och `app.json` har `ios.bundleIdentifier: com.veckis.app` + `supportsTablet: true`. Allt vi byggt hittills följer med automatiskt vid första iOS-build. Det som saknas för att faktiskt köra på iOS-device/TestFlight:

- [ ] **iOS-buildprofil i `app/eas.json`** — `preview` har bara `android.buildType: apk`. Lägg till `ios`-block (simulator-build för internt test, signerad för TestFlight). Eventuellt egen profil `preview-ios`.
- [ ] **Apple Developer-konto + bundle-registrering** — registrera `com.veckis.app` i App Store Connect / Developer Portal innan första `eas build --platform ios`.
- [ ] **APNs-uppsättning för push på iOS** — APNs-nyckel (.p8) uppladdad till EAS-credentials + Push capability på app-ID:t. Utan detta returnerar `registerForPush` (`app/src/lib/registerPush.ts`) `denied`/`error` på iOS. Alternativt `GoogleService-Info.plist` om FCM ska användas även på iOS (motsvarighet till `google-services.json` för Android, satt i `app.json` under `ios.googleServicesFile`).
- [ ] **Första TestFlight-build + smoketest** — verifiera att meny, recept, inköpslistor, sysslor, kalender, realtime, deeplinks och push faktiskt fungerar på iOS-device (inte bara simulator). Kontrollera särskilt KeyboardAvoidingView-`padding`-grenarna och Dynamic Island/safe-area-beteendet.
- [ ] **iOS-specifika finputs vid behov** — `Platform.OS === 'android'`-grenar (notification channel i `registerPush.ts:26`, vibration i `schedule.tsx:66`) har redan rätt fallback för iOS; bekräfta att inga andra Android-only-anrop smugit in.
