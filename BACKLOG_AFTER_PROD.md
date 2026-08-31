# Handlis — Aktiv backlog

**Arbetslistan.** Färsk feedback efter lansering **plus** alla öppna punkter som
migrerats hit från arkivet (27 st, minus 1 föråldrad sysslo-punkt). `BACKLOG.md`
behålls som **historik + fulla detaljer/beskrivningar** — jobba mot den här filen.
Avklarat markeras `[x]` här och arkiveras vid tillfälle.

## Generellt
- [ ] "x" i inputfält för att snabbt radera text — i alla textfält (sök, lägg-till-vara, receptfält). **Ej** i lösenordsfält.
- [ ] Bakåt-swipe inne i vissa inre komponenter (t.ex. adminloggar) går ur appen i stället för tillbaka till receptvyn.
- [ ] **Dra-för-att-stänga på bottom-sheet-modaler** — svep/dra nedåt (handtag eller hela sheeten) med följsam gest + studs tillbaka, i stället för bara "tryck utanför". Gäller alla bottom-sheets. Troligen RNGH Pan + reanimated, ev. standardisera på `@gorhom/bottom-sheet`. (Detaljer i arkivet.)

## Inköpslistan
- [x] Döp om "sub-kategorier" → **"underkategorier"** genomgående i UI — löst: enda kvar-strängen (`store.detail.subHint`) bytt; övriga labels sa redan "Underkategori".
- [ ] Kunna **sortera underkategorier utan att behöva visa dem** — idag går sub-sortering bara när man bockat i/visar en sub.
- [ ] Kunna **ta bort felaktiga varor**: håll inne på sökresultatet → "ta bort" i redigeringsläget. Följ ångra-toast-mönstret.
- [x] 🐛 Avmarkerade hopslagna varor **föreslås felaktigt som dubbletter** — löst: dubblett-detektorn (`duplicateGroups`) flaggar nu bara grupper med ≥2 OLIKA enheter; samma namn+enhet aggregeras redan visuellt till en rad → ingen redundant flagg.
- [ ] **Auto-sidoscrolla** till vald kategori + underkategori vid redigera/lägg till (scroll-into-view).
- [ ] Kunna **dra runt kategorier via de grå horisontella strecken** i stället för pilarna.
- [ ] **Höga tangentbords-modaler** (antal/lägg till/redigera vara & basvara) fyller nästan hela skärmen — ideal: scrolla bara det fokuserade fältet in i bild i stället för att lyfta hela sheeten. (Detaljer i arkivet.)
- [ ] **"Ta bort förslag" per hushåll** — kunna dölja vilket basvaru-/ingrediensförslag som helst (långtryck → "Ta bort förslag"), kräver per-hushåll dold-lista + filtrering i suggestions-endpointen.
- [ ] **Smartare global kategori-inlärning (moderation/konsensus)** — global `IngredientAlias.category` är idag last-write-wins → en feländring kan förstöra en kategori globalt. Steg: (1) "sticky + föreslå" (skriv ej över etablerad kategori, logga förslag), (2) admin-moderationskö, (3) auto-konsensus vid skala. (Full plan i arkivet.)

## Meny
- [ ] Kunna **överföra flera veckor samtidigt** till inköpslistan — slå ihop samma ingrediens över veckor + tydlig sammanfattning av vad som förs över.

## Recept
- [x] 🐛 **Receptbilden flimrar fortfarande i PWA** — löst: `onLoadStart` re-fyrade på RN Web vid varje re-render → `setHeroLoading` → loop → spinner-overlay blinkade. JS-loading-state körs nu bara på native; web låter webbläsaren sköta laddningen.
- [ ] Kunna **skapa ny inköpslista direkt** när man lägger till från ett recept (som veckomeny-överföringen redan gör).
- [ ] Laga-läget: **"steget" ska poppa upp så långt underifrån som möjligt** så man slipper skrolla i onödan.
- [ ] Vid scroll i receptlistan: **fäll ihop sök + taggar** (pil/knapp för att fälla ut igen).
- [ ] 🐛 Nytt recept: **"lägg till"-knappen lyfts inte tillräckligt** över tangentbordet (PWA + native).
- [ ] 🐛 Redigera vara (recept): **mängd/enhet lyfts inte tillräckligt** vid fokus, och **enhetsvalen syns inte alls** vid klick i enhetsfältet.
- [x] 🐛 **Ny butik-modalen går inte att stänga genom att klicka utanför** (PWA) — löst: absolut-fyllande KAV täckte utanför-tryck-Pressablen; flyttat till flex-1-mönster (tappbart tomrum inuti KAV:n) som övriga modaler.
- [ ] **Fota ett recept** (bild → recept) — bygg på AI-paste-pipen men med bild-input (Claude vision: OCR + strukturering). Nytt läge i segment-kontrollen. Kräver kamera-permission + native build.
- [ ] Ändra layout för "lägg till recept" om vi gör om det (t.ex. lista under varandra i stället för 4 flikar).

## Större satsningar & parkerade idéer
- [ ] **AI-agent: importtolkning** — tränar på att identifiera basvaror, måttenhet och rätt kategori vid receptimport.
- [ ] **AI-agent: personlig UX** — lär sig hur användaren brukar lägga till basvaror m.m. för bättre förslag.
- [ ] **Widget (hemskärm)** — visa veckomenyn direkt på hemskärmen. Kräver native modul (WidgetKit/App Widgets) + EAS-build.
- [ ] **Flerspråkighet (engelska)** — UI-lagret klart & parkerat på `feature/i18n-english`; kvar: kategori-labels, keyword-regler och global inlärning per språk. Återuppta vid faktiskt utlands-case. (Detaljer i arkivet.)
- [ ] **Streckkodsläsare** — utredd & nedprioriterad (OpenFoodFacts svag på svenska varor). Återupptas om bättre datakälla dyker upp.
- [ ] **Sökbar butiksdatabas** — dela butiker andra lagt in, slipp återskapa. Möjligt premium.
- [ ] **Statistik/insikter** — "mest lagade rätter", "vanligaste inköp" m.m. Möjligt premium tillsammans med butiksdatabasen.
- [ ] **Skafferi-minne** — persistent "har hemma" per hushåll så återkommande basvaror inte inventeras varje gång.
- [ ] **Datakvalitet-städning (admin)** — slå ihop/städa basvaror & kategorier så namn och kategori-minnen inte driftar.
- [ ] Kategori-taxonomi (bygger på taxonomi-arbetet): skafferi-minne exakt sub-matchning · söklogik prioriterar sub-träff · koppla datakvalitet-städ till sub-merge.
- [ ] Veckovyn i tablet — se över om den borde se ut som mobilen (allt under) i stället.
- [ ] **Skärmdumps-karusell** av faktiska app-skärmar på landningssidan (förtroende + SEO).
- [ ] **Nordstjärna: kärn-loopen** — appens kärna är *recept → veckomeny → inköpslista*. Väg framtida features mot den.

## iOS (första release)
- [ ] **Apple Developer-konto + bundle-registrering** (`com.handlis.app`) i App Store Connect innan första `eas build --platform ios`.
- [ ] **APNs-uppsättning för push på iOS** — .p8-nyckel till EAS + Push-capability (annars `denied`/`error` i `registerForPush`).
- [ ] **Första TestFlight-build + smoketest** — verifiera meny, recept, inköpslistor, realtime, deeplinks och push på riktig iOS-device (inte bara simulator); särskilt KAV-`padding`-grenar + Dynamic Island/safe-area.

## Innan prodsättning
- [ ] ⚠️ `withDisableAutofill`-pluginen (autofyll app-brett av) blockerar lösenordshanterar-autofyll på login. Utvärderad → avvaktar: app-bred med flit (Samsung Pass ignorerar fält-nivå). Riktad variant återöppnar Samsung-strulet + kräver native build + Samsung-test. Login funkar utan, bara mindre bekvämt.

> Perf/skala-punkter (SWR-cache, composite-endpoints, paginering, WS+Redis, always-on backend) ligger i `PROD_CHECKLIST.md`.
