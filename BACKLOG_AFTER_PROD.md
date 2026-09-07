# Handlis — Aktiv backlog

**Arbetslistan.** Färsk feedback efter lansering **plus** alla öppna punkter som
migrerats hit från arkivet (27 st, minus 1 föråldrad sysslo-punkt). `BACKLOG.md`
behålls som **historik + fulla detaljer/beskrivningar** — jobba mot den här filen.
Avklarat markeras `[x]` här och arkiveras vid tillfälle.

## Robusthet
- [x] **Dubblett-butiker/-recept vid snabbt dubbeltryck** — bekräftat i produktionsloggarna på både `createStore` och `createRecipe`: två lyckade POST några sekunder isär från samma tryckserie (React-state `creating` hinner släpa efter första trycket, så ett snabbt andra tryck smet igenom). Fanns i flera skärmars "skapa X"-formulär var för sig. Löst **centralt** i `api/client.ts`: `request()` deduplicerar nu alla muterande anrop (POST/PATCH/DELETE) på modul-nivå — ett identiskt anrop redan i flykt återanvänds istället för att skicka ett nytt. Skyddar alla skärmar automatiskt utan att varje formulär behöver egen ref-spärr (en sådan lades ändå till i `stores/index.tsx` som extra lager).
- [x] 🐛 **Veckomenyn: "gammalt recept dyker upp igen" vid ta bort + lägg till samma dag** — mångdagars produktionssaga (2026-09-02–07), två helt separata äkta grundorsaker (inte state/render-buggar, trots många felaktiga första teorier):
  1. **Idempotency-race i backend** — `idempotencyMiddleware` skrev bara cachen vid SLUT (efter routen svarat), aldrig vid start. Klientens "Network request failed"-fetch (mobilnäts pool-glitch, servern hade redan lyckats) triggade en retry med samma `Idempotency-Key`, men hann fram medan originalet fortfarande bearbetades → tom cache → routen kördes igen → äkta databasdubblett. Fix: nyckeln reserveras nu synkront vid start (`backend/src/lib/idempotency.ts`), verifierat både med enhetstest och en riktig lokal HTTP+DB-reproduktion.
  2. **`load()` kunde återuppliva en pending-borttagen rad** — "Ta bort" döljer kortet direkt (5s Ångra-fönster) men servern vet inget förrän den riktiga DELETE:n skickas efter 5s. Triggade NÅGOT en omladdning under den väntetiden hämtades färsk (helt korrekt) serverdata som fortfarande innehöll raden, och skrev tillbaka den i state. Fix: `load()`/`openWeekPicker()` filtrerar nu bort `pendingMenuItemRemovals` innan state sätts (`app/app/(tabs)/menu.tsx`).
  Lärdom: `DIAG v3`-instrumenteringen (loggade det FAKTISKA renderade per-dag-arrayet, inte bara jämförde state-källor) var det som till slut avslöjade racet i produktionsloggar — flera tidigare fixar (React-nycklar, `commitSerially`, forcerad remount, `removeClippedSubviews`) var rimliga men fel gissningar utan den evidensen.

## Säkerhet
- [ ] ⚠️ **Rotera Clerk production secret key** — `CLERK_SECRET_KEY` (sk_live_...) skrevs oavsiktligt ut i klartext i en Claude-konversation (2026-09-04, under review-kontots 2FA/hushålls-återställningsjobb). Generera ny nyckel i Clerk Dashboard → Configure → API Keys, uppdatera i Railway (veckis-tjänsten → Variables).
- [x] **`prisma/seed.ts` saknade skydd mot att köras mot fel DB** — löst 2026-09-04: samma "måste vara localhost"-spärr som redan fanns i `test/setup.ts` (den skyddar bara vitest-sviten, inte seed-scriptet). Grundorsak till skräphushållen nedan.
- [ ] **Städa bort skräp-hushåll i produktions-DB** — ~40+ testhushåll (`clerk-N-...`/`testuser1`/`Medlem N`-mönster, från `db:seed` och/eller test-fixtures körda mot prod innan spärren fanns) ligger kvar i produktions-Postgres, skapade 2026-04–2026-08. Ofarligt (ingen på dem är riktiga användare) men skräpar ner listor/statistik. Identifiera via `HouseholdMember.clerkUserId` som matchar `clerk-\d+-\d+`, `testuser\d*`, `user_dev_placeholder` och radera hushållen (cascade tar resten).
- [ ] **Clerk `user.deleted`-webhooken verkar inte köra i produktion** — upptäckt samma dag: ett raderat Clerk-konto lämnade sin `HouseholdMember`-rad kvar orörd i DB (skulle ha städats av `handleClerkUserDeleted`). Kolla att `CLERK_WEBHOOK_SECRET` är satt i Railway OCH att endpointen är registrerad för `user.deleted` i Clerk Dashboard → Webhooks.

## Generellt
- [x] "x" i inputfält (INNANFÖR fältet, höger) — löst: återanvändbar `ClearableInput`-komponent (row + fält flex:1 + absolut x). Applicerad på lägg-till-vara-baren + recept-titel/url/paste; sök-fälten hade redan. Ej lösenordsfält. Kan rullas ut på fler fält vid behov.
- [ ] Bakåt-swipe inne i vissa inre komponenter (t.ex. adminloggar) går ur appen i stället för tillbaka till receptvyn.
- [ ] **Dra-för-att-stänga på bottom-sheet-modaler** — svep/dra nedåt (handtag eller hela sheeten) med följsam gest + studs tillbaka, i stället för bara "tryck utanför". Gäller alla bottom-sheets. Troligen RNGH Pan + reanimated, ev. standardisera på `@gorhom/bottom-sheet`. (Detaljer i arkivet.)
- [ ] Kunna **byta tema (ljust/mörkt) även innan man är inloggad** — temaväxlaren finns idag bara inne i appen efter inloggning, borde gå att nå från inloggnings-/registreringsskärmen också.

## Konto/Profil
- [ ] 🐛 **Hela mailadressen syns inte under namnet i profilinställningar** — ".com" (eller motsvarande slutet av domänen) klipps bort. Återkommande bugg enligt användaren — trolig samma klass av fel som `project_android_text_clipping`-minnet (Android mäter texten för smalt → sista tecknen klipps). Behöver trolig fix: explicit bredd eller `numberOfLines`/ellipsis-hantering i stället för hård klippning.

## Inköpslistan
- [x] Döp om "sub-kategorier" → **"underkategorier"** genomgående i UI — löst: enda kvar-strängen (`store.detail.subHint`) bytt; övriga labels sa redan "Underkategori".
- [x] Kunna **sortera underkategorier utan att behöva visa dem** — löst: nytt `Store.subOrder`-fält håller ordningen för EJ utbrutna subs separat från `expandedSubs` (som fortsatt bara styr vilka som visas som egna sektioner + deras ordning). Gäller BÅDE standard- och egna underkategorier — egna subs skapas numera dolda (inte längre automatiskt visade) så de går att förplacera bland de dolda standard-subsen direkt, i stället för att behöva sorteras om varje gång fler subs slås på senare. `stores/[storeId].tsx` visar upp/ner-pilar på dolda subs (interfolierat, standard+egna); ren sorteringslogik i `src/lib/subOrder.ts` (testad).
- [ ] Kunna **ta bort felaktiga varor**: håll inne på sökresultatet → "ta bort" i redigeringsläget. Följ ångra-toast-mönstret.
- [x] 🐛 Avmarkerade hopslagna varor **föreslås felaktigt som dubbletter** — löst: dubblett-detektorn (`duplicateGroups`) flaggar nu bara grupper med ≥2 OLIKA enheter; samma namn+enhet aggregeras redan visuellt till en rad → ingen redundant flagg.
- [x] **Auto-sidoscrolla** till vald kategori + underkategori (redigera-vara) — löst: den aktiva chippens `onLayout` scrollar sin ScrollView så vald kategori/underkategori syns direkt vid öppning (inget timing-strul). Kan utökas till lägg-till-flödet.
- [x] Kunna **dra runt kategorier via de grå horisontella strecken** i stället för pilarna — löst: draghandtag (`reorder-three`) med RNGH Pan-gest, mäter varje rads skärm-absoluta position och jämför mot fingrets Y under draget (samma teknik som menyns dag-sektioner). Flytande etikett följer fingret, blå kant visar drop-position.
- [ ] **Höga tangentbords-modaler** (antal/lägg till/redigera vara & basvara) fyller nästan hela skärmen — ideal: scrolla bara det fokuserade fältet in i bild i stället för att lyfta hela sheeten. (Detaljer i arkivet.)
- [ ] **"Ta bort förslag" per hushåll** — kunna dölja vilket basvaru-/ingrediensförslag som helst (långtryck → "Ta bort förslag"), kräver per-hushåll dold-lista + filtrering i suggestions-endpointen.
- [ ] **Smartare global kategori-inlärning (moderation/konsensus)** — global `IngredientAlias.category` är idag last-write-wins → en feländring kan förstöra en kategori globalt. Steg: (1) "sticky + föreslå" (skriv ej över etablerad kategori, logga förslag), (2) admin-moderationskö, (3) auto-konsensus vid skala. (Full plan i arkivet.)
- [ ] 🐛 **Inventeringsläget ("vad har du hemma") glömmer ifyllda mängder om man trycker bakåt av misstag** — borde komma ihåg/återställa vad som redan angetts i stället för att nollställas.
- [ ] 🐛 **Standardikonen för ny inköpslista matchar inte den faktiska ikonen** — visar en sopkvast i skapa-dialogen men det blir inte den ikonen på den skapade listan (eller tvärtom — förslags-/förhandsvisnings-ikonen stämmer inte med resultatet).
- [ ] **Kategori-"dölj" per butik gör egentligen inte det den låter som** — döljer bara sorteringsordning (varan hamnar sist), tar aldrig faktiskt bort sektionen. Diskuterat 2026-09-07: `category` är globalt per vara (`ShoppingItem.category` + global `IngredientAlias`-inlärning), INTE butiksspecifikt. Bästa vägen framåt: låta en butik **slå ihop** en kategori med en annan lokalt (t.ex. "Barn & baby" → "Övrigt" i just den butiken) i stället för att döljs — varan behåller sin globala kategori, grupperas bara under en annan sektion vid visning. Enkel v1: en nivå, inga kedjor, ev. subs till den ihopslagna kategorin slås med automatiskt.

## Meny
- [ ] Kunna **överföra flera veckor samtidigt** till inköpslistan — slå ihop samma ingrediens över veckor + tydlig sammanfattning av vad som förs över.

## Recept
- [x] 🐛 **Receptbilden flimrar fortfarande i PWA** — löst: `onLoadStart` re-fyrade på RN Web vid varje re-render → `setHeroLoading` → loop → spinner-overlay blinkade. JS-loading-state körs nu bara på native; web låter webbläsaren sköta laddningen.
- [x] Kunna **skapa ny inköpslista direkt** när man lägger till från ett recept — löst: överförings-modalen visar nu en skapa-rad (namn + Skapa) när hushållet saknar lista; `createListAndTransfer` skapar listan och överför direkt.
- [x] Laga-läget: **"steget" poppar upp så långt underifrån som möjligt** — löst: `cookBody` ankras nu mot botten (`justifyContent: flex-end`) i stället för centrerat → steget sitter nära nav/tummen, synligt utan skroll.
- [x] Vid scroll i receptlistan: **fäll ihop sök + taggar** — löst: `filtersOpen`-state; auto-hopfälls vid scroll ner (>80px), fälls ut vid toppen (<12px) eller via chevron-pilen. Kollapsad rad visar sök-ikon + aktiv-prick + chevron.
- [ ] 🐛 Nytt recept: **"lägg till"-knappen lyfts inte tillräckligt** över tangentbordet (PWA + native).
- [ ] 🐛 **"Skapa nytt recept"-knappen lyfts inte tillräckligt** över tangentbordet i någon av flikarna den finns i (bredare/annan variant av samma mönster som raden ovan — flera olika entry-points).
- [ ] 🐛 Redigera vara (recept): **mängd/enhet lyfts inte tillräckligt** vid fokus, och **enhetsvalen syns inte alls** vid klick i enhetsfältet.
- [ ] 🐛 **Redigera recept: bakåt-swipe kastar bort osparade ändringar utan förfrågan** — borde fråga "spara eller slänga ändringar?" om något ändrats innan man lämnar receptet, i stället för att bara stänga tyst.
- [ ] **Spara-knappen vid receptredigering syns bara efter nedskroll** — borde vara alltid synlig (svävande/fixerad längst ner) i stället för att kräva scroll för att hitta den.
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
