# Veckis — Backlog

## UI-förbättringar/buggar

### Feedback från pwa Iphone-användare
- [x] Skärmen för smal i veckomenyn: `Dimensions.get('window').width` statiskt → `useWindowDimensions()` i menu.tsx + schedule.tsx; FlatList-sidor fick rätt bredd
- [x] Samma veckonummer när man swipar mellan veckor: rot-orsak = statisk `weekPageW` → fel snapping → weekOffset uppdaterades inte; fixat med `useWindowDimensions()`
- [x] Går inte att trycka på "+" i veckomenyn: knappar hamnade utanför rätt area pga fel sidbredd; fixat med `useWindowDimensions()`
- [x] La in en rätt på en dag men den försvann: statisk sidbredd → FlatList renderade fel vecksida → menyn tycktes tom; fixat med `useWindowDimensions()`
- [x] menyn beter sig märkligt som att den "laddar in massa versioner av sidan samtidigt": statisk `weekPageW` → FlatList-sidor inte korrekt justerade på iOS PWA; fixat
- [x] Aktivitet överstruken trots heldagsaktivitet i framtiden: logiken ser korrekt ut (d.dateStr > todayStr → isPast=false) — stängs, aldrig reproducerat
- [x] Går inte att redigera eller ta bort en aktivitet, inget händer när man trycker på redigera: (a) `pointerEvents="box-none"` på KAV-wrappare i schedule.tsx (3 st), chores.tsx, menu.tsx, settings.tsx m.fl. blockerade child-klick på iOS Safari web — borttagna i alla filer; (b) `pointerEvents="box-none"` borttaget från ConfirmDialog + WelcomeModal; (c) ny `kavBehavior`-helper (src/lib/platform.ts) detekterar iOS via userAgent → `'padding'` i stället för `'height'` som kraschade layouten
- [x] trycker man på "idag"-knappen blir sidan blank ibland: statisk `weekPageW` → `scrollToIndex` scrollade till fel position; fixat med `useWindowDimensions()`
- [x] går inte att trycka på knappar ibland, bl.a. "förstått" i tipsen och "butiker" i inköp: (a) `pointerEvents="box-none"` på SpotlightTip card-View → på iOS Safari web blockeras child-klick; borttagen (b) `pointerEvents="box-none"` borttaget från KAV-wrappare i shopping/[listId].tsx + recipes/index.tsx (c) CSS: `-webkit-tap-highlight-color: transparent` + `touch-action: manipulation` på interaktiva element i patch-index-html.mjs
- [x] la till ett recept, sedan hoppade halva sidan utanför bild och fastnade: KAV `behavior='height'` på iOS Safari PWA (Platform.OS==='web' → 'height' → shrunk container). Ny `kavBehavior`-helper i `src/lib/platform.ts` detekterar iOS via userAgent → `'padding'` på alla KAV-instanser i appen (13 filer)
- [x] veckomenyn blir tom när man lagt in recept, måste toggla: statisk `weekPageW` → FlatList landade på fel sida; fixat med `useWindowDimensions()`
- [x] Lägga till en basvara i inköpslista öppnar en jättemodal som är dubbelt så stor: `maxHeight: '85%'` → nu `windowHeight * 0.75` via `useWindowDimensions()` + `pointerEvents="box-none"` borttagen på KAV
- [x] "+" i inköpslistan får inte riktigt plats i skärmen: FAB `bottom: 20` ignorerade home-indicator; nu `bottom: 20 + insets.bottom`
- [x] bilder i recept laggar som bara den: Cloudinary-bilder saknar explicit storleksparameter för mobile — `cloudinaryOptimized(url, 800)` lägger till `w_800,q_auto,f_auto` i upload-URL:en; icke-Cloudinary-URLer passeras omodifierade
- [x] går inte att scrolla i veckomenyn: statisk `weekPageW` → FlatList-scroll fungerade inte rätt på iOS PWA; fixat med `useWindowDimensions()`
- [x] ta bort aktivitet fungerar fortfarande inte i PWA: ConfirmDialog race condition — React 18 batchar state-uppdateringar i samma handler, så `b.onPress()→setOpts(deleteOpts)` skrevs omedelbart över av `onClose()→setOpts(null)`; fixat genom att kalla `onClose()` FÖRE `b.onPress()` + overlay omstrukturerades från `absoluteFillObject+sheetWrap` till flex-1-kolumn (Pressable fyller ytan ovanför sheet) för att eliminera iOS Safari stacking-context-risk
- [x] dialoger visar inte allt innehåll i PWA (t.ex. lägga till ny basvara): `kavWrap: { position:'absolute', top:0, bottom:0 }` på KAV-wrappern i alla shopping/[listId].tsx-modaler — absolut-positionerat KAV täckte hela skärmen och lade sig ovanpå overlay-Pressable → oförutsägbart beteende på iOS Safari; nu flex-1-mönster (Pressable flex:1 + KAV i normalflöde) + `maxHeight: windowHeight * 0.85` i absoluta pixlar
- [x] '+' syns inte helt i inköpslistan (PWA): `addBar` saknade bottom safe area — home indicator (~34px) dolde addBtn; nu `paddingBottom: Math.max(12, insets.bottom)` på addBar-View
- [x] swipa i kalendern uppdaterar inte veckonumret (PWA): `onMomentumScrollEnd` fyrar inte tillförlitligt på iOS Safari för `pagingEnabled` horisontell FlatList; lade till `onScrollEndDrag` med identisk handler på båda FlatLists i schedule.tsx (vecko-rad + dag-innehålls-pager)
- [x] måste zooma ut för att se hela redigera-aktivitet-dialogen (PWA + Android): `position:'absolute'` på KAV i editingEntry/editingCalChore/showModal fyllde hela skärmen → sheet tog 92% av skärmhöjden; fixat med flex-1-kolumn-mönster (som ConfirmDialog) + `maxHeight: windowHeight * 0.85` i absoluta pixlar
- [x] kan inte trycka utanför redigera-aktivitet-dialogen (PWA + Android): samma `position:'absolute'` KAV lade sig ovanpå overlay-Pressable → taps nådde aldrig dismiss-handlern; fixat i samma ändring ovan
- [x] swipar man bort ett par veckor och trycker 'idag' blir innehållet i veckan tomt (PWA + Android): `scrollToIndex` misslyckas tyst när target-index ligger utanför FlatLists render-window (`onScrollToIndexFailed={() => {}}` slukar felet); ersatt med `scrollToOffset(index * weekPageW)` som alltid fungerar
- [x] swipa veckor i meny och kalendern uppdaterar fortfarande inte veckonumren (PWA + Android): varken `onMomentumScrollEnd` eller `onScrollEndDrag` fyrar tillförlitligt på alla plattformar; ersatt med debounced `onScroll` (80 ms) på FlatList i schedule.tsx (vecko-rad + dag-pager) och menu.tsx; `onMomentumScrollEnd` behållen som backup
- [x] swipa veckor i kalendern fastnar på närlgliggande veckor (Android native): debounced `onScroll` kördes på native och triggade state-updates mitt i momentum-animationen → jank; `onScroll` är nu web-only (`Platform.OS === 'web'`) i schedule.tsx + menu.tsx; native använder enbart `onMomentumScrollEnd`
- [x] veckorna flyger iväg vid swipe i kalender-PWA: `setWeekRef` i scroll-handlern triggade `useEffect → scrollToOffset(animated:false)` som avbröt CSS scroll-snap-animationen; `weekScrollFromUser`/`dayScrollFromUser`-refs sätts true i scroll-handlers → useEffect hoppar över scrollToOffset när användaren svepte
- [x] måste zooma ut för att se hela redigera-aktivitet-dialogen (fortfarande): `maxHeight` sänkt till 0.80, `paddingBottom: insets.bottom` tillagd (home indicator-overlap), `flex: 1` på ScrollViews i editingEntry + showModal (fick CSS att respektera maxHeight-gränsen på iOS Safari web)
- [x] kan inte trycka utanför dialogen i redigera syssla + saknade rundade hörn: `position:'absolute'` KAV i showCreate + editingChore (chores.tsx) bytt till flex-1-mönster; `maxHeight: windowHeight * 0.80, paddingBottom: insets.bottom` + `flex: 1` på ScrollViews tillagda

#### Feedback-omgång 2026-06-09 (Android PWA)
- [x] "Ingen skugga bakom dialog" på action-sheets (Ta bort-bekräftelse, "Du handlar nu", redigera/ta bort aktivitet): `ConfirmDialog` overlay-Pressablen var transparent (flex:1 ovanför sheeten) → ingen dimning alls. Flyttade dimningen till ytter-containern (`s.overlay { flex:1, rgba(17,24,39,0.55) }`) så den även täcker bakom de rundade övre hörnen; behöll flex-kolumn-strukturen + transparent dismiss-Pressable (iOS Safari tap-säker).
- [x] "Skuggar inte hörnen" på basvaru-browsern (välj per kategori, t.ex. Kött & fisk / Frukt & grönt): dim-Pressablen låg bara *ovanför* sheeten → de rundade övre hörnen visade osuddad sidbakgrund. Wrappade i dim-container (`s.overlay`) med transparent flex:1-Pressable inuti (shopping/[listId].tsx showBrowser).
- [x] Svep hörn-dim-fixen över alla återstående sheets: alla `<Pressable s.overlay/><sheet/>`-modaler bytte till transparent `overlay` (flex:1) + eget absolut `overlayDim`-lager (täcker bakom de rundade hörnen utan att röra closing-tags eller sheet-position). Klart i shopping/[listId].tsx (browser, editingItem, editingStaple, mergeSheet, actionsMenu, rename, manualPicker), shopping.tsx, menu.tsx (4), chores.tsx (3), schedule.tsx (4), recipes/index.tsx (3), recipes/[recipeId].tsx (showTransfer). settings.tsx hade absolut botten-sheet men saknade dim → la till `rgba(0,0,0,0.4)` på overlayn (dimmar alla 8). account.tsx var redan rätt (absolut dim + botten). stores/[storeId].tsx rename byttes till flex:1+overlayDim (låg i toppen).
- [x] Qty/redigera-vara-dialogerna: enhets-fältet trängdes ut utanför skärmkanten ("enhet syns inte"). Rotorsak: BÅDE antal- och enhets-fältet var `flex:1` → raden för bred. ~~Flyttade enhet till egen rad~~ (fel — användaren ville ha samma rad som native). Rätt fix: antalsfältet fast smalt (`width:70`), enhet kvar på samma rad (`flex:1` + `minWidth:0`) → [−][antal][+][enhet] får plats på en rad precis som i native-appen.
- [x] Sticky kategori-rubrik visade fel namn ("KLART" ovanför obockad "Bröd"): `updateSticky` bröt loopen vid första gruppen ovanför navbar-linjen → fel rubrik om en grupps onLayout-y ännu inte mätts/kom i annan ordning på web. Nu väljs rubriken vars y ligger *närmast ovanför* linjen (ordnings-oberoende). Verifiera på device.
- [x] "+"-knappen i "Lägg till vara"-baren syns inte helt (kläms utanför högerkanten, även utan tangentbord): `addInput` (flex `<TextInput>`) saknade `minWidth: 0` → på web hindrade `min-width:auto` input:en från att krympa → raden blev bredare än skärmen och tryckte ut "+". Tillagt `minWidth: 0`.
- [x] "Lägg till vara"-baren hoppar upp när tangentbordet öppnas i PWA: Android Chrome resizear viewport → baren flöt upp av sig självt, KAV adderade extra padding → dubbelhopp. Fix: `enabled={keyboardVisible && (Platform.OS !== 'web' || isIOSLike)}` — KAV avaktiverat på Android web, kvar på iOS Safari PWA (där viewport inte resizeas)

#### Feedback-omgång 2 (2026-06-09, Android PWA)
- [x] Tilldela-person-knapparna ("user-knapparna") onödigt tjocka i syssla/aktivitet-editorn: `MultiMemberPicker.memberChip` slimmad (`paddingVertical 8→6`, `borderRadius 20→16`) så de matchar upprepnings-knapparnas höjd.
- [x] Går inte att swipa mellan veckor i menyn när det ligger maträtter inlagda: RNGH:s `GestureDetector` (long-press-drag för att flytta maträtt mellan dagar) sätter `touch-action: none` på varje kort på web → blockerar browserns horisontella sid-svep (tomma listor gick att swipa, fulla inte). Native opåverkat. På web renderas korten nu utan `GestureDetector` (svep funkar) + flytt-mellan-dagar görs via nya dag-chips ("Flytta till dag") i det utfällda kortet. Native behåller drag.
- [x] Qty-/vara-dialogen blev "fullscreen size" på bred/webb-viewport: `s.sheet` saknade `maxWidth` → spände kant-till-kant. La till `width:'100%', maxWidth:480, alignSelf:'center'` (gäller alla shopping-sheets) → full bredd på telefon (<480), capad + centrerad som en telefon-sheet på bred viewport.
- [x] Sökresultat-chipsen (förslag medan man skriver) hamnade utanför skärmkanten: raden var en vanlig `View` (`chipRow`) utan scroll. Bytt till horisontell `ScrollView` (`keyboardShouldPersistTaps="handled"`) → swipa höger för fler. ("Dina vanligaste" har redan wrap.)
- [x] (utredning, behöver device) App-innehållet renderas ibland i en smal vänsterkolumn (~halva bredden) i PWA medan modalen går kant-till-kant. Det finns INGEN maxWidth/frame i koden — allt är `flex:1` full bredd — så detta är sannolikt ett browser-zoom/visual-viewport-tillstånd (samma misstänkta orsak som tidigare "delvis inzoomad"). Repro-steg: hård omladdning + nollställ sidzoom. Ev. överväg centrerad max-bredd-frame för web (krockar dock med tablet-split-vyer i kalender/meny). Stängs: ingen kod-rot-orsak, sannolikt viewport-tillstånd — aldrig reproducerat.

#### Regressions 2026-06-10
- [x] Aktivitets-/sysslomodaler (schedule.tsx) hamnade under viewport på PWA: `<View style={{ flex: 1 }}>`-wrapper runt modal-innehållet tvingade overlay-Pressablen (flex:1) att fylla hela wrapphöjden → sheet puttades under skärmen. `ScrollView flex:1` i editingEntry + showModal gav 0-höjd i auto-höjd KAV-förälder utan definierad höjd på web. Båda borttagna — matchar nu inköpslistans flex-mönster.

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
- [x] Backend integration-tester — vitest med isolerad test-DB (`veckis_test`) + truncate-per-test för deterministisk state. Setup-fil med säkerhetsspärr (kräver `veckis_test` i URL:n). Tester täcker: medlem-borttagning rensar assignedToMany på chores + scheduleEntries, orphan-count räknar både fält (3 tester); chore create/update med syncAssignedTo, rotation cyklar deterministiskt på completions.length, cascade-delete av completions (5 tester); shopping item auto-inferrar subCategory + category, mergedIntoId-filter döljer underordnade rader vid GET/PATCH, "jag handlar"-presence, store-konfig defaults + expandedSubs persistens (8 tester). 76 → 108 gröna tester.
- [x] Migrera alla `Alert.alert` till nya `ConfirmDialog`/`useConfirm`: 62 av 62 klara. Sista omgången migrerade settings (6), schedule (6), MenuTemplatesModal (2), household/setup (2), sign-in/up (4). Kopierat-/bekräftade info-toast:as nu istället för att öppna en alert. Alert-importerna städade i 6 filer.
- [x] Fixa en snygg app-logga — veckoring med 7 segment (indigo→lila→rosa) + V/bock i mitten i lila→rosa-gradient. Genererad från SVG (`app/assets/*.svg`) till PNG via `app/scripts/render-icons.mjs` (resvg). app.json refererar nu icon/splash/adaptiveIcon/favicon. Splash bg `#f5f3ff`, Android adaptive bg `#ede9fe`. Native build krävs för att icon syns i appen.
- [x] Bjuda in via länk — "Dela länk"-knapp i bjud-in-sektionen genererar `https://veckis-web.onrender.com/household/setup?code=XXX`. På web: Web Share API där det stödjs, annars clipboard-kopiering. På native: systemets share-sheet. Setup-skärmen läser ?code från URL och växlar till "Gå med"-fliken med koden förfylld; persisterar tillfälligt i localStorage så koden överlever sign-in-redirects.
- [x] Distribution: `/install`-landningssida som detekterar OS/browser (Android Chrome/Samsung/Firefox, iOS Safari/Chrome, desktop Chrome/Edge/Firefox/Safari) och visar rätt instruktion + APK-knapp + PWA-install-knapp via beforeinstallprompt. Plus `InstallBanner` på sign-in som triggar Chromes egen prompt eller iOS-hint (e.preventDefault() tystar Chromes auto-prompt så det inte blir kaka på kaka). 7-dagars dismiss-flag. iOS App Store är fortfarande beroende av Apple Dev-konto + TestFlight.
- [x] Glömt lösenord-flow i sign-in: två-stegs reset_password_email_code via Clerk (skicka kod → mata in kod + nytt lösenord). Inline i sign-in.tsx, ingen Account Portal-redirect.
- [x] Privacy + Terms-sidor på publika routes `/privacy` och `/terms` (NavigationGuard skippar). Länkade från Profil-fliken (ny ÖVRIGT-sektion längst ner) + Lämna hushåll-knapp.
- [x] Lämna hushåll själv — `POST /api/households/:id/leave` med samma cleanup som admin-driven remove + sista-admin-skydd (sista admin måste först delegera). Knapp i Profil → ÖVRIGT → 'Lämna hushållet' med confirm-dialog.
- [x] "Ny version tillgänglig"-banner på PWA. SW-registreringen i index.html lyssnar på controllerchange/updatefound och fyrar `veckis-new-version`-event. VersionBanner-komponenten i app-root visar lila topplist med Ladda om-knapp så användare inte fastnar på gammal cache.
- [x] Snäva CORS från `*` till en faktisk whitelist — `backend/src/lib/corsAllowlist.ts` har förlåtande matchning (lowercase + strip trailing slash via `normalizeOrigin`) + loggar varje unik blockad origin en gång till Render logs (`[CORS] Blocked origin: ...`). 14 tester på normalizeOrigin/parseAllowlist/makeOriginCheck. Aktiveras genom att sätta `CORS_ORIGIN` på Render till t.ex. `https://veckis-web.onrender.com,http://localhost:3000,http://localhost:19006,http://localhost:8081`. Vid start loggar backend `[CORS] Whitelist active: [...]` så man ser exakt vad som plockades upp.
- [x] 404-route: `app/+not-found.tsx` med vänlig "Sidan hittades inte"-vy + lila ikon-cirkel + Tillbaka-/Till kalendern-knappar. Visar felaktiga path:en. Fångar typos i delade länkar och okända deep-links.
- [x] Render free-tier wake-up-indikator: `src/lib/backendWakeup.ts` pub/sub-modul som wrap:ar varje request via `trackBackendRequest`. Om första anropet tar > 3 sek fyras 'waking' → `WakeupIndicator` (lila topplist) visar "Servern vaknar… det här tar ofta 10–20 sek första gången". När anropet lyckas markeras backend som vaken permanent — toast spammar inte efterföljande anrop. Failade requests resettar inte vakenheten (en fail betyder inte att backend är vaken).
- [x] Frontend test-infra: vitest + 48 gröna pure-function-tester. Täcker week.ts (ISO-vecka edge cases inkl år 2020 v53 + 31 dec → v1/nästa år), text.ts (capitalize), buildAssignedLabel (extraherad ur chores.tsx; null-fall, legacy assignedTo, rotation med 2/3 personer + cykling, borttagna medlemmar), inviteUrl (URL-encoding, tom kod), installDetect (parsa UA för Android Chrome/Samsung/Firefox, iOS Safari/Chrome, desktop Chrome/Edge/Firefox/Safari, iPad-maskerade-som-Mac via touch-points).
- [x] Städa upp legacy-kod: tog bort död kod i app:en (verifierat med `tsc --noUnusedLocals/--noUnusedParameters` + 48 gröna tester). Bl.a.: hel död inline-butikseditor i `shopping/[listId]` (state + 7 funktioner) **plus en bortkastad `getStores`-hämtning i load()**; oanvänd `DayPicker`-komponent + `toggleDay` i chores; döda Profil-refaktor-rester i settings (`handleSignOut/Open2FA/ContactSupport/DeleteAccount/ResetTips` + `openClerkPortal` + tillhörande state/imports); döda custom-kategori-funktioner i `stores/[storeId]`; samt ~20 oanvända imports/lokaler i 9 filer. Inga beteendeförändringar.
- [x] Tillgänglighet: ~~allt som nås via long-press ska även ha en synlig knapp~~ + accessibility-labels på ikonknappar. "Synlig knapp"-delen är obsolet: long-press är borttaget och ersatt av 3-prickar-menyer + synliga text-knappar (Redigera/Ta bort med text läses redan av VoiceOver/TalkBack). Slutförde label-passet på de få **ikon-only**-knapparna utan text — sök-rensa (recept + butiker), ta-bort-ingrediens, samt close/ta-bort i MenuTemplatesModal/NotificationsModal. (Navigations-/åtgärds-ikoner hade redan labels.) Inga visuella ändringar.
- [x] Refaktorera och skapa fler filer för egna komponenter mm (separat från legacy-städningen ovan — bryta ut komponenter/logik ur de stora skärmfilerna): (1) `MultiMemberPicker` utbruten ur chores.tsx → egen fil + egen StyleSheet + 8 render-tester; (2) performer-väljarens logik → `lib/performerOptions.ts` (`buildPerformerOptions`) + 7 tester; (3) SpotlightTip-gaten → `lib/tipGate.ts` (`evaluateTipGate`) + 7 tester; (4) `buildCategoryGroups` (kärn-grupperingen i inköpslistan) → `lib/categoryGroups.ts`, generisk + 6 tester inkl. regression. `pickPerformer`/`show()` är nu tunna wrappers; grupperingen är frikopplad från skärmfilen. 81 gröna totalt, mergat till prod. Vidare utbrytning görs opportunistiskt vid behov.
- [x] Frontend render-tester (RNTL) — **infra klar**: vitest med `react-native`→`react-native-web`-alias, jsdom opt-in per testfil (`// @vitest-environment jsdom`), Ionicons-mock. Deps: jsdom + @testing-library/react/jest-dom/dom (installerade med `--legacy-peer-deps` pga befintlig react/react-dom-versionsavvikelse). Första render-testet: `RecurrencePicker.test.tsx` (5 tester). Totalt 53 gröna. **Kvar:** de prioriterade inline-komponenterna (MultiMemberPicker, performer-pickern, SpotlightTip-gate) ligger i `chores.tsx` och är kopplade till den filens StyleSheet — måste brytas ut till egna filer (= komponent-refaktor-punkten) innan de kan render-testas isolerat. Infran är redo för dem då.
- [x] ⚠️ Innan go-live: fixa support-mailadressen. **LÖST (2026-06-08): bytt `support@veckis.app` → `veckis.support@gmail.com`** (gratis dedikerad Gmail, ingen domän att köpa). Clerk ger ingen inkorg och forward kräver ägd domän, så gratis-Gmail var enda no-cost-vägen. Ändrat i terms.tsx (2), privacy.tsx (2), preferences.tsx (mailto) och settings.tsx (mailto). Adressen når användarna vid nästa OTA/PWA-deploy. **Kvar för dig:** skapa själva Gmail-kontot `veckis.support@gmail.com` så mailen tas emot.
- [x] Trycker man på en notis hamnar man inne i redigeringsläget. Räcker att hamna i sysslor/kalender-fliken etc: notis-deep-link öppnade `doOpenEditEntry`/`openEdit` (redigering). Nu öppnar aktivitetsnotisen läsvyn (`setViewingEntry`, se #7) på kalenderfliken, och syssel-notisen landar bara på sysslor-fliken (paramet konsumeras utan att öppna editor).
- [x] Byt ut "Vanliga husemojin" under rubriken i flikarna till en hus-ikon: `ScreenHeader` visar nu en `home`-Ionicon i stället för default-🏠 (custom `householdEmoji` visas fortfarande om hushållet satt en).
- [x] Prod-felsynlighet: `ErrorBoundary` (app/src/components) fångar render-fel app-brett → vänlig "Något gick fel"-vy + "Försök igen"; global `ErrorUtils`-handler (`installGlobalErrorHandler`) fångar ouppfångade JS-fel. Båda rapporterar via `reportClientError` (best-effort, dedupad) till ny oautentiserad `POST /api/client-errors` som loggar strukturerat (`[CLIENT ERROR] {...}`) till Render-loggarna → prod-fel blir synliga. Ren `buildErrorReport`-helper + tester (4 unit + 3 RNTL). Lättvikt (ingen native-modul/Sentry) så det når via OTA. Framtida: skicka till Sentry/DB + aggregering.
- [x] ersätt "scrapar" med hämtar eller annat mer trevligt och okonventionellt ord: recept-import-tipset säger nu "så hämtar appen titel, ingredienser…" (matchar "Hämta recept"-knappen). Var enda synliga förekomsten; `scraping`-state m.m. är internt.
- [x] Byta plats på sysslor och meny-fliken: ny flik-ordning Inköp · Meny · Kalender · Sysslor · Hushållet (chores ↔ menu bytta i `(tabs)/_layout.tsx`, Kalender kvar i mitten).
- [x] "Ny version laddad"-prompt på native efter OTA: PWA har VersionBanner, men native-användare måste själva gissa att de ska stänga/öppna appen för att få uppdateringen. Diskret prompt när en OTA hämtats ("ny version klar — starta om").
- [x] Offline-/nätverksindikator: diskret grå banner (OfflineBanner) när appen tappar anslutning — använder navigator.onLine + browser-events på web/PWA; native kräver @react-native-community/netinfo + EAS-build (anteckning i koden, graceful fallback = alltid online på native tills vidare).
- [x] Tar man bort sitt konto fastnar man på "Välkommen till Veckis" med endast val att välja "Skapa/Gå med" knappar. Borde komma till logga in-sidan istället 
- [x] Horisontell-vy (landskap) i tablet funkar fortfarande inte i praktiken trots tablet-stöd (bugg, inte feature-önskemål): app.json orientation→default + expo-screen-orientation lockAsync(PORTRAIT_UP) på telefoner, unlockAsync på tablets; ny EAS preview-build klar
- [ ] Ljud för toasts eller liknande. Avcheckning inköpslistan eller överföring av meny
- [ ] Designpass — visuell konsekvens i ett svep (kräver visuellt omdöme, görs bäst samlat): (a) **skuggor på kort** är inkonsekventa genom hela appen; (b) **dialog-rutor** ska vara rundade upptill och inte genomskinliga nedtill — butiker, filter, veckomenymallar och notiser saknar rundade hörn upptill (audit: alla sheets är redan rundade upptill, paddingBottom-variansen är strukturell, och de grå modalerna MenuTemplatesModal/NotificationsModal är ev. avsiktligt grå); (c) **grönt passar dåligt mot skuggan**
- [x] Enhetligt beslut om bakåt i tid: meny tillåter navigering till tidigare veckor men cart-FAB ("Överför veckomeny") döljs — man kan se historik men inte överföra; återkommande aktiviteter antar startdatum = idag om inget väljs, men användaren kan sätta ett datum bakåt manuellt; sysslor blockeras sedan tidigare (kan ej skapa bakåt i tid).
- [x] Synliggör/aggregera klientfelen: in-memory ring-buffer (max 200 fel) i backend — `POST /api/client-errors` sparar nu + loggar; `GET /api/client-errors` (requireAuth) returnerar de senaste (nyast först). Expanderbar `ClientErrorsSection` i Hushållet-fliken (admin only) visar lista med namn, meddelande, platform, version och tid; tryck på rad för att se stack trace.

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
- [x] Byta hushåll borde komma upp som förslag om man trycker på Hushållets namn — tap på hushållskortet fäller ut listan inline (samma mönster som sysslor). Chevron visas bara om man har 2+ hushåll.
- [x] Skapa och gå med i hushåll borde göras under 3 prickarna eller under hushållets namn — egen "ANDRA HUSHÅLL"-sektion längst ner med Skapa nytt + Gå med via kod.
- [x] Inställningar-fliken döpt om till "Profil" med personikon. Konto-kortet är tryckbart och fäller ut Byt nickname + Logga ut (separata logga-ut-knappen borttagen). Hushållets rename/delete bor i en egen 3-prickar-knapp på hushållskortet (alltid synlig för admin, oberoende av "Hantera"-toggle:n som nu bara styr medlemmar).
- [x] Hjälp/Support i 3-prickar-menyn (Profil): ny rad "Kontakta support · support@veckis.app" som öppnar mailto med subject + body förfylld med versionsinfo (`Veckis ${expoConfig.version}` + plattform). Web: window.location.href. Native: Linking.openURL.
- [x] Radera mitt konto in-app (Profil → ÖVRIGT): röd "Ta bort kontot"-rad → confirm → `DELETE /api/account`. Backend städar medlemskapen FÖRST (återanvänder `handleClerkUserDeleted`, deterministiskt) och raderar sedan Clerk-kontot via `@clerk/backend` `users.deleteUser` (secret key) — appen loggar ut. **Ersatte** det gamla portal-flödet (`openClerkPortal('/user')`) som krävde att Clerks self-service-deletion-toggle var på och lämnade appen. `user.deleted`-webhooken blir nu en idempotent safety net för raderingar via Clerk-dashboard/annat håll. (Self-service-toggeln behöver inte vara på.)
- [x] Backend: Clerk user.deleted-webhook → ta bort föräldralösa hushållsmedlemskap: ny `POST /api/webhooks/clerk` (Svix-signaturverifierad via `svix` + monterad med rå body före `express.json`). På `user.deleted` rensas användarens medlemskap i ALLA hushåll (`handleClerkUserDeleted` i `lib/memberCleanup`): cascade-rensning av `assignedToMany`/`assignedTo` + radering av raden (delad `cascadeRemoveMember`-helper, som `leave` nu också använder); om den raderade var ende admin och andra medlemmar finns → äldsta befordras till admin (annars lämnas tomt hushåll för framtida städning). 3 integrationstester (134 backend-gröna). **Kvar för dig:** lägg env `CLERK_WEBHOOK_SECRET` (Signing Secret) + konfigurera endpointen i Clerk Dashboard → Webhooks, prenumerera på `user.deleted`. Utan secret svarar endpointen 500 och loggar varning. Framtida: städa helt tomma hushåll.


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
- [x] Klarmarkera hel kategori i inköpslistan kräver nu bekräftelse: "Klarmarkera hela kategorin? X varor markeras som klara" med "Klarmarkera" / "Avbryt"
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
- [x] Flytta upp specialkost-kategori i en butik funkar inte i praktiken (låg kvar längst ned): `buildCategoryGroups` lade bara en parent i `orderedEnum` om den hade *direkta* items. När alla special-diet-items brutits ut i expanderade subs (vegan/glutenfritt/övrig specialkost) saknade `special_diet` direkta items → hamnade aldrig i ordningen → sub-sektionerna orphan:ades sist oavsett butiksordning. Nu inkluderas parents som har expanderade subs i `orderedEnum` (på sin butiksordnings-position); parent-headern hoppas över när den saknar direkta items men sub-sektionerna renderas i rätt slot. Den döda orphan-loopen borttagen.
- [x] "Du handlar nu" bannern lägger sig ovanpå rubriken: bannern var absolut-positionerad i titel-områdets position. Först flyttad till en centrerad pill i navbaren, men den krockade med rubriken när den fälls upp till mitten vid scroll. Slutlig lösning (v3): full text "X handlar" till höger innan scroll som kollapsar (opacity + maxWidth via `scrollY`-interpolation) till bara den rosa gubbe-ikonen när rubriken fälls upp till mitten. Ikonen pulserar diskret var ~10:e sekund (Reanimated withRepeat/withSequence/withDelay) som påminnelse. Tryck på den när jag själv handlar → dialog "Avsluta handla-läge"; tryck när någon annan handlar → toast med vem.
- [x] Vyn för att markera dubbletter själv ser nu ut som vanliga inköpslistan: den manuella väljaren visade en platt, bokstavsordnad lista. Nu grupperas varorna med samma `buildCategoryGroups` + kategori-headers (emoji + label, subs) som huvudlistan, och listan får växa (flexShrink istället för fast maxHeight 200) så det känns som den vanliga listan. Bocka i ≥2 → Fortsätt.
- [x] Inköpsflikens översikt: list-korten visade "{namn} handlar" även när det var jag själv. Nu "Du handlar" när inloggad användare = aktiv shopper (matchar `clerkUserId`); annars medlemmens namn. (Samma som i list-detaljens indikator.)
- [x] Mängd-inmatning överallt: auto-"0" vid inledande "," + visa alltid "," (inte "."). Gemensam `normalizeQtyInput`-helper (`app/src/lib/qty.ts`) på alla qty-fält (inköp: lägg till/redigera/slå ihop, recept-ingredienser, meny-inventering). Stegknapparna (+/−) producerade tidigare "."-strängar — nu normaliserade till ",".
- [x] Butik alltid i navbaren: butiken bor nu permanent i navbaren (vänster, efter bakåt-knappen, tryckbar → byt butik). Namnet visas innan scroll och kollapsar (opacity + maxWidth via `scrollY`) till bara `storefront`-ikonen när rubriken fälls upp till mitten. Den gamla butiksknappen i scroll-raden borttagen (dubblett-badgen kvar). Bonus: fixade rubrikens vertikala centrering i navbaren vid kollaps (`adjustY` hade fel tecken → låg ~4px för lågt).
- [x] Sticky kategori-rubrik: aktuell kategorirubrik fastnar nu precis under navbaren tills nästa kategori når dit. Löst med en manuell pinnad overlay (`stickyCat`) som uppdateras från scroll-offset (`runOnJS` i scroll-handlern) + per-grupp `onLayout`-y; visar kategorin vars rad passerar navbar-linjen, döljs överst.
- [x] Kunna ta swipa höger för att ta bort en vara från inköpslistan helt (med ångra toast)
- [x] För långt butiksnamn och "Du handlar" tar mycket plats i navbaren
- [x] Byt namn på "Bockat" till "Klart"
- [x] "Klart" kategorin hakar i toppen när man scrollar in på den sektionen: "Klart"-sektionen ingår nu i sticky-spårningen (`catOrderRef` + `onLayout`-y), så sticky-overlayn visar "Klart" precis under navbaren när man scrollat ned till de avbockade varorna.
- [x] Push till hushållet när någon tar "Jag handlar": presence-indikatorn syns bara inne i appen. En notis ("Anna handlar nu") förhindrar dubbelturer till affären på riktigt.
- [x] "Jag handlar"-läge auto-utgång: om någon claim:ar och glömmer släppa fastnar "Anna handlar" i dagar. Auto-släpp efter inaktivitet (t.ex. 2 h) utöver dagens auto-rensning vid list-rensning.
- [x] Skapa ny lista-dialogen skuggade inte all bakgrund (ljus text syntes bakom de rundade hörnen): dim flyttad till eget absolut `overlayDim`-lager (rgba(0,0,0,0.4)) som täcker hela skärmen inkl. bakom hörnen. (shopping.tsx)
- [x] Trycker man "Välj butik" i skapa-lista-dialogen låg dialogen kvar och skymde butikslistan: dialogen döljs nu (`setShowModal(false)`) medan man väljer butik och återställs (`setShowModal(true)`, namnet kvar i state) när valet är klart/avbrutet. (shopping.tsx)
- [x] Ny butik-dialogen hamnade i toppen i stället för botten: rotorsak = `overlay` var `position:absolute` → ingen flex-sibling puttade ner sheeten. Bytt till `overlay: flex:1` (transparent Pressable puttar ner) + `overlayDim`. (stores/index.tsx; samma fix på stores/[storeId].tsx rename.)
- [x] Bocka av hel kategori med ett tryck: tryck på kategorirubriken → "Markera alla som klara" — minskar tryck vid hyllan
- [x] Emoji per inköpslista: likt sysslor och aktiviteter kunna sätta en emoji på listan (🛒 Willys, 🏕️ Campingtur, 🎄 Julmat) för bättre igenkänning i översikten
- [x] Inga varor hör till chark och deli just nu: `inferSubCategory` saknade "korv" (generiskt), "wienerkorv", "grillkorv", "bratwurst", "prosciutto", "blodpudding" m.fl. Tillagda i `shared/src/lib/inferSubCategory.ts`. `backfillSubCategory` körs vid serverstart och omklassificerar befintliga DB-rader.
- [x] Offline-tålig synk för inköp: avbockning offline rullas inte längre tillbaka — nätverksfel köar mutationen i `shoppingOfflineQueue` (module-level Map, överlever navigering). Vid nästa `load()` (focus/reconnect) appliceras kön ovanpå server-datan och spolas upp mot API:et. `markAllInCategory` hanteras likadant. Serverfel (4xx/5xx) rullar fortfarande tillbaka och visar fel.


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
- [x] Tar man bort en maträtt och flyttar en annan rätt till den dagen får man en varning att dagen redan är planerad trots att man tagit bort den tidigare maträtten: dag-upptagen-kollarna räknade items i pending-removal (5s ångra-fönster) som listan redan döljer. Nu exkluderas `pendingMenuItemRemovals` i alla tre dubbelkollarna (moveToDay, addRecipeToDay dag-kollen + recipeId-kollen).
- [x] Lägger man in en maträtt på en tidigare/framtida vecka läggs den in på nuvarande vecka: rotorsak = receptväljaren navigerar via `router.replace('/(tabs)/menu?addRecipeId=...')` som återställer menyns `weekOffset`. Nu trådas den visade veckan genom navigeringen (`forMenuWeek=YYYY-WW`) via alla hopp (openPicker, startReplaceRecipe, create-flödet, recipes/index, recipes/[recipeId]); vid retur återställs `weekOffset` till målveckan och tillägget väntar tills rätt veckas meny laddats (korrekta dubbelkollar + optimistisk insert). (Produktfrågan "borde man kunna lägga på tidigare vecka alls" kvarstår som separat val.)
- [x] Trycker man "planera en rätt" i framtida vecka hamnar den i nuvarande veckas meny: samma rotorsak/fix som ovan (vecka trådas genom receptväljaren)
- [x] Lägga in automatiskt en "0" om man skriver ",": "Har"-inputen i inventeringssteget var bunden till ett tal → man kunde inte skriva ett inledande "," (blev NaN → nollställdes). Nu en draft-sträng (`amountDraft`) för aktivt fält som normaliserar "." → "," och prependar "0" vid inledande "," (→ "0,"). (Samma normalisering nu på ALLA qty-fält i appen via delad `normalizeQtyInput`.)
- [x] Inventering: "Allt"/"Har"-knappen heter nu "Finns" (både mätbara och omätta rader) — tydligare att den markerar att varan finns hemma.
- [x] Sidan blinkar till när man lägger till en rätt via "+" på en dag i menyn: backend broadcastar `menu_updated` till oss själva → `load()` 350ms senare → full `setMenuItems()`-re-render mitt i optimistisk uppdatering. Fix: `suppressMenuReloadRef` (counter) ökas före varje lokal mutation (add/delete/move); socket-hanteraren hoppar över reloaden om counter > 0.
- [x] Hoppar tillbaka till nuvarande vecka efter att ha lagt in rätt i framtida vecka: `addRecipeId`-effekten anropade `setWeekOffset(...)` som uppdaterade state men inte scrollade FlatList:en → visuellt landade man på fel vecka. Fixat: `setWeekOffset` bytt till `goToWeek(..., false)` som synkar state + `scrollToOffset` atomärt.
- [x] Välja vecka när man "Planera i meny" från receptvyn: 3-prickar-menyn i `recipes/[recipeId].tsx` har nu "Planera i meny" som öppnar ett bottom-sheet med veckochips (aktuell + 4 framåt) och dagchips (mån–sön + ingen dag). Navigerar till menyn med rätt `forMenuWeek`-param och återgår till vald vecka.
- [x] Välja vecka när man trycker kalender-ikonen i receptlistan: dag-picker-sheetet i `recipes/index.tsx` har nu veckochips (aktuell + 4 framåt) ovanför dagvalet. "Planerad"-indikatorn hämtas per vald vecka (useEffect + stale-flag) och uppdateras via socket om en annan enhet ändrar samma vecka medan sheetet är öppet.
- [ ] ⚠️ KOM IHÅG: `withDisableAutofill`-pluginen stänger av autofyll app-brett. Om/när vi gör en riktig inloggning med lösenord (där lösenordshanterar-autofyll är önskvärt) måste pluginen tas bort ur app.json (+ ny EAS-build), alternativt göras mer riktad så bara recept-fälten exkluderas.
- [x] Klistra in ett recept i manuellt-läget vid skapande av recept: "Klistra in recepttext (AI tolkar)"-toggle i manuellt-läge expanderar en TextInput + "Tolka och skapa recept"-knapp; backend POST /api/recipes/parse-text (Claude Haiku) extraherar titel, ingredienser, instruktioner och beskrivning ur godtycklig text (upp till 80 000 tecken) — klarar hela webbsidor, råa recepttexter m.m.
- [x] "Laga nu"-läge i receptvyn: Kontextberoende FAB nere till höger — från kalender visas "Laga nu" (restaurang-ikon), från menyn visas kundkorg. Laga-läget är helskärm med mörk bakgrund; ingredienser som diskret horisontellt scroll-band överst; stegnavigering Föregående/Nästa + progress-dots; sista steget avslutar med "Klart!"-knapp.

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
- [x] Engångstillfälle upprepas ändå varje vecka trots ingen upprepning vald: tillfällen renderades på `e.day === veckodag` utan att respektera `recurrenceType`, och engångstillfällen skapades med `startDate: null` → ingen veckoinformation → visades varje matchande veckodag. Nu (a) ankras engångstillfällen vid skapande till det faktiska datumet (`startDate`/`endDate` = vald dag i visad vecka), och (b) renderingen går via ny `entryVisibleOnDate`-helper som speglar `choreVisibleOnDay` och delegerar till `occursOn`. Fixar på köpet latenta buggar för befintliga tillfällen (varannan-vecka, flera veckodagar, dagliga/månatliga renderades tidigare fel)
- [x] Klickar man på en aktivitet borde man inte hamna direkt i redigeringsläge utan bara read-vy med sammanfattning + redigering under 3 prickar: ny `viewingEntry`-läsvy (modal) som visar titel + datum/veckodag, tid/heldag, upprepning (ny `recurrenceSummary`-helper), tilldelade personer, gemensam/privat och beskrivning. 3-prickar i headern (`openEntryActions`) → Redigera/Ta bort. Tap på kortet öppnar nu läsvyn (long-press → 3-prickar-menyn direkt); tablet-månadsvyn öppnar också läsvyn. (Testfix v2: bottensheet:en klipptes fortfarande → byggd om till **helskärmsvy** med egen nav-rad (tillbaka + 3-prickar) och scrollbar kropp.)
- [x] Aktivitetsdialogen (testfynd): (a) ingen toast vid spara/skapa — nu `showToast('Aktivitet sparad'/'skapad', 'success')`; (b) gick inte att trycka på andra knappar (t.ex. tilldela personer) med tangentbordet uppe — `keyboardShouldPersistTaps="handled"` på både de yttre (vertikala) OCH de nästlade horisontella medlemsväljar-ScrollView:erna (den nästlade var kvar-buggen i v1)
- [x] Skapa ny aktivitet saknar påminnelse-val: påminnelse-toggle visas nu i skapa-flödet när tid är aktiverad (dold när ingen tid är vald — samma beteende som redigera). `remind` skickas som false om ingen tid är angiven.
- [x] Syssla-läsvy (viewingChore) och aktivitets-läsvy (viewingEntry): pil + 3-prickar hamnade för långt ned på Android/web — Modal renderar redan under statusbaren, `paddingTop: insets.top` dubbel-paddade. Nu `paddingTop: Platform.OS === 'ios' ? insets.top : 0` (iOS behöver padding för notch, Android/web inte).
- [x] Kunna välja påminnelsetid — hur lång tid innan aktiviteten notisen ska skickas (t.ex. 5, 10, 15, 30, 60 min); idag är det bara på/av. Per aktivitet via chips (5/10/15/30/60 min); fallback på hushållets globala inställning (reminderMinutes). Schema-fält `remindMinutes Int?` på ScheduleEntry + migration + backend Zod + scheduler-logik uppdaterad.
- [x] Påminnelse-urskivan (RemindDial) laggade vid snurrning och visade tick-marks istället för en tårtbit: PanResponder (JS-tråd + setTotalAngle per frame) bytt till react-native-gesture-handler Gesture.Pan() + Reanimated useSharedValue/useAnimatedStyle (UI-tråd) — snurrningen rinner nu flytande utan JS-blockering. Tick-marks ersatta med en tårtbit-fyllning (0→100% per varv) via tvåhalvcirklar-clip-teknik med plain Views (ingen SVG); tar om från toppen vid varje nytt varv.
- [x] RemindDial v2 — noll-render-gestur + pie fill-pivot-fix + UX-finputs: (a) all React-state borttagen ur `onPanResponderMove` → 0 re-renders under dragning; mitt-texten använder `AnimatedTextInput` + `useAnimatedProps` (UI-tråd worklet, `formatRemindTime` + `totalAngleToMinutes` märkta `'worklet'`); `pageX/pageY` ersätter `locationX/locationY` (koordinater stabila mot re-renders); (b) tårtbit-pivot-formel `T(px)·R·T(-px)` rättad — translateX-värdena var vertalt; fyllningen är nu korrekt under all rotering; (c) zon 3 begränsad till 1–7 dagar (inte 1–14); (d) zon-indikator-prickarna/rubrikerna under klockan borttagna; (e) `onLayout` fångar y-position för tid-sektionen → ScrollView scrollar dit automatiskt när man togglar på Tid.
- [x] Multipla påminnelser per aktivitet: "+" under RemindDial lägger till ytterligare en påminnelse (max 3); × på varje klocka tar bort den. Backend: `remindMinutes Int?` → `Int[] @default([])` via custom SQL-migration (NULL→[], int→[int]); shared-typ + Zod + notis-scheduler uppdaterade (per-window dedupe-nyckel `activity:{id}:{date}:{userId}:{window}` så varje fönster fyrar oberoende). Frontend state: `newRemindMinutes: number[]` / `editEntryRemindMinutes: number[]`.
- [x] RemindDial UX-förbättringar: (a) center-pricken + klockarmen (strecket mot mitten) borttagna ur RemindDial — kvar är bara tårtbits-fyllning, indikator-dot på kanten och mitttext; (b) en-klocka-för-alla-mönster: klockan är nu delad för alla påminnelser — tryck "Lägg till" → chip med valt värde visas ovanför, klockan gömmer sig; "Lägg till påminnelse"-länk visar klockan igen för nästa val (max 3 chips); (c) påminnelsetider visas nu i aktivitetens läsvy (notifications-ikon + "X min, Y tim innan").
- [x] Aktivitets-/sysslo-sheets (schedule.tsx + chores.tsx) visades som en smal remsa i botten på Expo SDK 54 / Fabric (ny arkitektur): KAV utan style fick noll höjd i det nya layout-systemet. Fixat med `position:'absolute', bottom:0` + `pointerEvents="box-none"` på KAV — matchar samma mönster som menu.tsx/settings.tsx; backdrop-Pressable bytt till `absoluteFillObject` och tar emot tappar utanför sheeten.
- [x] RemindDial startar vid 0 ("Vid start"): `formatRemindTime(0)` returnerar "Vid start" (inte "0 min"); urskivan tillåter nu 0° (Math.max(0,...)); initial state + reset efter lägg-till sätts till 0 i både skapa- och redigeringsläge; klockan får marginVertical:12 för andrum.
- [x] RemindDial center som knapp + max 5 påminnelser: center-cirkeln är nu en `Pressable` — snurra på ytterringen för att välja tid, tryck i mitten för att lägga till; centret animerar vitt→mörkblått (indigo) med vit text medan man drar (visuell ledtråd att den är tryckbar); den separata "Lägg till"-knappen under klockan borttagen; max antal höjt från 3 till 5. Pie-fyllningen nollställs inte längre vid zonövergångar (min→tim→dag) — `ha = Math.min(totalAngle, 360)` håller tårtan full från zon 2 och uppåt.
- [x] RemindDial orm-arc + pulsknapp: tårtbiten ersatt med en "orm"/worm-arc (3-lager D-shape-teknik — mörkt huvud, ljus svans, bakgrundstäckning) som åker runt vid snurrning; synligt segment ~150° med gradient-känsla (ljusare → mörkare indigo). Center-knappen har fast indigo-färg (#4f46e5) och pulserar en gång (scale-sekvens) när klockan visas så man förstår att den är tryckbar. Tap-detection sker i PanResponder release (ingen `Pressable` inuti pan-handler). Färgen intensifieras per varv (zone 0–3: #818cf8→#6366f1→#4f46e5→#3730a3).
- [x] RemindDial finputs: carry-lager (4:e D-shape) gör att ringen förblir färgad vid varv-gränser — bakgrundstäckning använder carry-färgen i zon 1+ (aldrig vit igen); max-gräns (8 veckor/1440°) behandlar ha=360 istället för 0 så sista varvet inte återgår till dagsfärg; center-knapp alltid mörkast (#312e81 indigo-900, mörkare än ormens max #3730a3); pulsering triggas även vid release av drag (inte bara vid visning av klockan); duplikat-påminnelse ignoreras tyst — includes-check i onAdd-callback stänger klockan utan att lägga in samma tid en gång till.


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
- [x] Sysslor – rotation-action-tip: när användaren har 2+ medlemmar valda i editorn (i create eller edit) fyrar "Turas om automatiskt"-tipset en gång (seen-rotation-toggle-tip) som förklarar toggle:n
- [x] "Min tur" är överflödig knapp: borttagen (chip + `myTurnOnly`-state + turn-filtret i `sortedChores`). `computeCurrentTurn` används fortfarande för rotation-beräkningen i editorn.
- [x] Sysslor borde sorteras efter tidigast förfallodatum: ej-klara sorteras nu på effektivt förfallodatum (överförfallna/dagens datum först via `recurringStatus`, nästa tillfälle annars; engångssysslor = idag). Klara hamnar fortsatt sist.
- [x] Om engångstillfälle borde man inte kunna välja "turas om automatiskt" då det bara händer en gång: `MultiMemberPicker` fick en `rotationAllowed`-prop (false när `recurrenceType === 'none'`) → rotation-raden visas utgråad med förklaringen "Välj en upprepning först — en engångssyssla kan inte turas om". Save-logiken tvingar dessutom `rotation: false` för engångssysslor. + test.
- [x] Borde kunna välja turordning (om turas om)
- [x] Kopiera syssla: "Kopiera" i 3-prickar-läsvyn skapar ett utkast med samma titel, frekvens, dagar och tilldelade — undviker att fylla i allt för liknande sysslor
- [x] Anteckning vid klarmarkering av syssla: borttagen — upplevdes som överflödig och irriterande (note-fältet finns kvar i schemat för framtida bruk)
- [x] 3-prickar-menyn i sysslor och kalender visas nu uppe till höger (fade-popup-card) istället för som bottom sheet — `variant: 'menu'` i `ConfirmDialog`, same top-right position på alla ställen
- [x] 3-prickar-menyn positioneras i övre höger hörnet (top:0, right:0) — samma position som inköpslistans actionsMenu; measureInWindow-ansatsen avvecklades (insets.top returnerade fel värde inuti Modal på Android); alla 4 call sites (schedule, chores, recipes, stores) förenklade till direktanrop utan ref/mätning.
- [x] Klarmarkera återkommande syssla → delat kort: avbockad syssla visas överstruken längst ned (kan ångras) + ett "uppkommande"-kort med nästa datum dyker upp bland de aktiva. Sorteras rätt efter nästa datum.
- [x] Sortering av sysslor: pre-computade statuser i `sortedChores`, recurring done sorteras efter nextDate (snarast = högst upp bland avklarade), once-done hamnar sist
- [x] Borde aldrig skapa sysslor bakåt i tiden, endast från idag och framåt
- [x] Utfällda sysslor borde se ut mer som att de hör till rubriken, nu har de en grå border som knappt syns och sitter inte ihop med rubriken. Borde se ut som en utfälld maträtt i veckomenyn
- [x] Läsvy-symmetri för sysslor: kalenderaktiviteter öppnar nu en read-vy (tap → sammanfattning, redigering under 3-prickar), men en syssla öppnar fortfarande direkt redigering/utfälld vy. Överväg samma läs-först-mönster för konsekvens.
- [x] Push-notis vid avbockning av syssla: "Joakim dammsög ✓" skickas till övriga hushållsmedlemmar; ny `choreCompleted`-preferens (default på) i notis-inställningarna; migration + sendPush + backend Zod uppdaterade
- [x] Avcheckad återkommande syssla (den 1a varje månad) visar samma datum som varit som nästa
- [x] Datum står som valfritt men har man väl valt ett datum kan man inte ta bort det: ×-knapp dyker upp till höger om datumknappen när datum är satt (gäller alla 4 kombinationer: skapa/redigera × engång/startdatum)
- [x] Rensa avklarade återkommande sysslor — "Rensa"-knapp i sysslo-headern raderar engångssysslor + nollställer avbockade återkommande (uncomplete) i samma operation med confirm-dialog som räknar upp exakt vad som rensas
- [x] Saknas en "första gången"-knapp som finns i andra flikar: `wrapChoreAddTip` (seen-chores-add-tip) lagt till på sysslors FAB — förklarar frekvens, tilldelning och rotation vid första trycket


---

## Agent
- [x] Identifiera storleksordning på mått så att den alltid går på det största måttet när den ska slå ihop samma vara (helper + tester + integration i planAutoMerge: grupperar på namn, kombinerar kompatibla enheter via combineQuantities, faller tillbaka på per-enhet-subgrupper för inkompatibla)
- [ ] en AI-agent som tränar på att identifiera basvaror, vad som är måttenhet och rätt kategori när den importerar recept.
- [ ] kanske en agent som lär sig hur användaren brukar lägga till basvaror, aktiviteter etc för att få en bättre UI experience?
- [ ] Bli ännu smartare på ihopslagning av dubbletter. Så att den förstår att 400 g + 1 paket --> 2 paket istället för 401 g etc

---

## Ej helt färdiga stories, idéstadie
- [x] Skrapa även tillvägagångssätt/instruktioner vid recept-import (URL) och fyll i instructions-fältet automatiskt (parseInstructions flattenar JSON-LD recipeInstructions — sträng/array/HowToStep/HowToSection — till numrerade rader; from-url returnerar instructions och receptet skapas med dem)
- [x] Populära/senast använda recept överst i "välj rätt"-läget (likt "Dina vanligaste" i inköp) — sorter-knapp i recept-headern med radioval: A–Ö / Mest använda / Senast tillagda; valet sparas (gäller även välj-läget). "Mest använda" = livstidsräknare Recipe.timesUsed som ökar varje gång receptet läggs i en meny (backfilld från nuvarande förekomster)
- [x] Spåna mer på inventeringsdelen då det blir lite orent med bocka av/Ange mängd — byggd om till enhetlig rad-vy: namn + behov + "Har"-input + "✓ Allt"-knapp per rad. Mode-toggle/segment borttagen, sub-pager utan, KAV gated i ingredients-steget, Nästa/Tillbaka döljs när tangentbordet är uppe, returnKeyType="next" hoppar mellan mätbara rader.
- [x] bygga en pwa — hostas på `veckis-web.onrender.com` via Render static site. Manifest.json, service worker (cache-first static + network-first HTML + network-only API + dedup-blockerings-logg), index.html-patch-script som injekterar PWA-meta, ikoner (192/512/180/48), `/install`-landningssida med OS-detection, `InstallBanner` på sign-in som tystar Chromes auto-prompt, `VersionBanner` på controllerchange. Native fortfarande primärt distributionssätt — PWA är "gratis-vägen" för folk utan EAS-build.
- [ ] Streckkodsläsare för att direkt lägga till en vara — **utredd & nedprioriterad**: OpenFoodFacts (enda realistiska gratis-källa) testad manuellt på vanliga svenska/butiks-egna varor (ekologiskt äppelmos, soltorkade tomater, bostongurka) → ingen träff. Täckningen är god för internationella märkesvaror men svag där svenska hushåll faktiskt handlar. Scannern skulle hjälpa exakt där OFF är svagast och är överflödig där OFF är stark (vanliga repeaters klaras redan av autocomplete + stapleItems). Native-modul + EAS-build + scan-UI + error-states bedömt inte värt det. Återupptas om en bättre datakälla dyker upp (t.ex. svensk butikspartnerskap eller paid API med bra svensk täckning).
- [ ] Kategorier — skafferi-minne får exakt matchning på subCategory (bygger på #283 nedan): "ost" i skafferi matchar bara items med subCategory='ost', inte hela mejeri-kategorin. Kräver att taxonomi-bygget är klart.
- [ ] Kategorier — söklogik prioriterar subCategory-träff: sök "smör" matchar items med subCategory='smör_margarin' före LIKE-träff på name. Bygger på taxonomi.
- [ ] Kategorier — koppla datakvalitet-städningen (rad 282 nedan) till sub-merge: admin-vy kan slå ihop duplicat-skapade subs eller mappa om ärvda customCategory-strängar.
- [ ] Veckovyn i tablet borde kanske se likadan ut som i mobilen med allt under?
- [ ] ha en sökbar databas på butiker som andra lagt till för att på så vis slippa skapa butiker som redan finns inlagda. Kanske ett premium-alternativ?
- [ ] Statistik/insikter: lättviktsvy med "mest lagade rätter", "vem gör flest sysslor", "vanligaste inköp" — möjligt premium-läge tillsammans med butiksdatabasen
- [ ] Datakvalitet-städning: admin-vy för att slå ihop/städa basvaror & kategorier så normaliserade namn och delade kategori-minnen inte driftar över tid
- [ ] Skafferi-minne: persistent "har hemma" som minns över sessioner (eget skafferi per hushåll) så återkommande basvaror inte behöver inventeras varje gång. Bygger vidare på den hopslagna inventeringen.
- [ ] Utnyttja större skärm likt kalender-vyn att saker öppnas bredvid istället för under mm.
- [ ] Radikalt alternativ för återkommande sysslor: flexibelt intervall per syssla — nästa förfallodag räknas från när man senast gjorde sysslan ("var 3:e dag" från senaste utförandet) istället för fast kalender. Ingen förfallet-hög alls; passar rytm-sysslor (vattna/dammsuga), sämre för fasta dagar (sopor på måndag). Skulle vara ett val per syssla: "fast dag" vs "ungefär var X:e dag". (Subsumerar tidigare "klarmarkera bakåt"-idén — täcks nu av förlåtande-modellen i Sysslor-sektionen.)
- [ ] "Kom igång"-vägledning för nya hushåll: efter setup, en kort checklista (lägg till första receptet / inköpslistan / sysslan) som hjälper adoption nu när riktiga användare signar upp. **Implementation finns i `feature/getting-started-card`** — utvärderas mot befintliga onboarding-tips.

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
- [x] Persistera "överförd till inköpslista"-status per veckomenyrätt: `WeekMenuItem.transferred Boolean @default(false)` sätts vid `POST /api/menus/to-shopping`; frontend visar checkmark-badge om `item.transferred || !!recipeListMap[item.id]?.length` — rensning av inköpslistan tar inte bort badgen

### Inköpslistan

- [x] **Deduplicering av ingredienser** — Samma ingrediens (samma namn + enhet) adderas ihop vid transfer från meny istället för att bli dubbletter. (Delvis fixat för transfer, men kolla manuella tillägg också.)

### Inställningar

- [x] **Redigera hushåll** — Admin kan ändra hushållets namn. Se och ta bort medlemmar. Sätta smeknamn på sig själv
- [x] **Flera hushål** — Skapa och växla mellan flera hushål under inställningar (t.ex. eget + sommarstugan). Aktivt hushål sparas i context
- [x] **Profiler utan konto** — Skapa lokala profiler för barn/personer utan Clerk-konto. Kan tilldelas sysslor och chorer utan att logga in

### iOS

All JS-kod är plattformsneutral (Expo/RN) och `app.json` har `ios.bundleIdentifier: com.veckis.app` + `supportsTablet: true`. Allt vi byggt hittills följer med automatiskt vid första iOS-build. Det som saknas för att faktiskt köra på iOS-device/TestFlight:

- [x] **iOS-buildprofil i `app/eas.json`** — `preview` har nu `ios.simulator=false` + `buildConfiguration=Release`. Tre profiler totalt: `preview` (device, internal-share QR), `preview-simulator` (snabb simulator-build, ingen signering), `production` (app-store). `submit.production.ios.ascAppId` är placeholder tills App Store Connect-id finns. app.json `ios.infoPlist`: `UIBackgroundModes: ["remote-notification"]` + `ITSAppUsesNonExemptEncryption: false`.
- [ ] **Apple Developer-konto + bundle-registrering** — registrera `com.veckis.app` i App Store Connect / Developer Portal innan första `eas build --platform ios`.
- [ ] **APNs-uppsättning för push på iOS** — APNs-nyckel (.p8) uppladdad till EAS-credentials + Push capability på app-ID:t. Utan detta returnerar `registerForPush` (`app/src/lib/registerPush.ts`) `denied`/`error` på iOS. Alternativt `GoogleService-Info.plist` om FCM ska användas även på iOS (motsvarighet till `google-services.json` för Android, satt i `app.json` under `ios.googleServicesFile`).
- [ ] **Första TestFlight-build + smoketest** — verifiera att meny, recept, inköpslistor, sysslor, kalender, realtime, deeplinks och push faktiskt fungerar på iOS-device (inte bara simulator). Kontrollera särskilt KeyboardAvoidingView-`padding`-grenarna och Dynamic Island/safe-area-beteendet.
- [x] **iOS-specifika finputs vid behov** — audit klar 2026-06-02; uppdaterad 2026-06-09. KAV behavior-buggen på iOS Safari PWA (Platform.OS==='web' → 'height' i stället för 'padding') åtgärdad med ny `kavBehavior`-helper i `src/lib/platform.ts` (detekterar iOS via userAgent) — ersatte `Platform.OS === 'ios' ? 'padding' : 'height'` i 13 filer. Notification channel-setup, Vibration.vibrate, expo push token-fetch oförändrade.
