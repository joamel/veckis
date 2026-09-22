# Handlis

Hushållsapp för meny, sysslor, kalender och inköpslistor. Utgiven på Google Play.

> Internt heter allt fortfarande `veckis` (repo, Expo-slug, Railway-tjänst) sedan namnbytet.
> Det är avsiktligt — ett byte skulle bryta OTA-kanalen och Play-kopplingen.

## Workspace-struktur

- `app/` — Expo/React Native-klient
- `backend/` — Express + Prisma + Postgres
- `shared/` — delade typer

## Branches

- `develop` — utveckling, frontenden pekar mot `localhost:3000`
- `main` — produktion. Backend + Postgres på Railway
  (`https://veckis-production.up.railway.app`); Render kör bara den statiska webb-PWA:n.

## Lokal utveckling

```bash
npm install
npm run dev:backend   # Express på :3000 (kräver Postgres på :5432)
npm run dev:app       # Expo Metro
```

## Backend-endpoints (urval)

| Endpoint | Beskrivning |
|----------|-------------|
| `POST /api/menus/copy` | Kopiera alla `weekMenuItems` från en ISO-vecka till en annan inom samma hushåll. Body: `{ householdId, fromWeekYear, fromWeekNumber, toWeekYear, toWeekNumber, overwrite? }`. Returnerar `{ copied, items[] }`. UI saknas i appen ännu. |
| `POST /api/shopping/items/merge` | Soft-merge av flera shopping-items till en synthetic container (originalen blir dolda, återställs vid borttagning av rätten). Body: `{ sourceIds[], name, quantity, unit?, category }`. |
| `POST /api/menus/to-shopping` | Överför ingredienser från valda menyobjekt till en inköpslista; dedupliceras på `menuItemId` + name+unit. |
| `GET /api/shopping/lists` | Inkluderar `linkedMenuItemIds` (visible + hidden) per lista för korrekt "redan-överförd"-detektion. |
| `WS /ws/shopping/:listId` | Realtidsuppdatering för inköpslista (item_added/updated/deleted). |
| `WS /ws/household/:id` | Realtidsuppdatering för hushållets schedule + chores (schedule_entry_added/updated/deleted, chore_added/updated/deleted). |

## Backend-helpers (utility)

- **`combineQuantities`** (`backend/src/lib/unitOrder.ts`) — summerar och promotar mätningar mellan volym (krm/tsk/msk/dl/l) och massa (g/kg) enligt svenska köks-konventioner: 500 ml → 0.5 l, 30 ml → 2 msk, 500 g → 0.5 kg. Returnerar `null` vid blandade familjer eller okända enheter (st/påse). Inte än wirad in i `to-shopping`/`merge`-dedupe.
- **`planFullUnmerge`** (`backend/src/lib/mergeLogic.ts`) — räknar ut vilka items som ska återställas (blad) vs raderas (containers) när en merge-träd unmergas vid borttagning av en rätt.

## Datamodell — anteckningar

- `ScheduleEntry.assignedToMany: String[]` — array med medlems-IDn. Multi-user-aktiviteter. `assignedTo` (singular) behålls för bakåtkompatibilitet och synkas alltid med första elementet i `assignedToMany`.
- `ShoppingItem.mergedIntoId: String?` — pekar på en synthetic container när items är dolda under en merge. List-queries filtrerar `mergedIntoId IS NULL` så bara den synliga containern syns. Cascade-delete på FK.

## Tester

```bash
npm test --workspace=backend          # vitest, 230 tester
npm test --workspace=app              # vitest, 124 tester
```

## Underhållsskript (`backend/scripts/`)

Städar ingrediensdatan. Körs för hand, aldrig automatiskt, och **alla är
torrkörning som standard** — inget skrivs förrän du ber om det.

Varje skript ställer EN fråga. Det är skillnaden mellan dem:

```bash
npm run clean:prefix        # Mängd först i namnet: "1/2 dl strösocker" → "strösocker". Slår ihop med varan om den finns.
npm run clean:junk          # Rader som inte är varunamn alls: receptstycken, HTML-entiteter, meningar.
npm run clean:dupes         # Varianter av SAMMA vara: stavfel, versaler, singular/plural.
npm run clean:names         # Kortar långa namn. Enda skriptet där AI föreslår.
npm run clean:aliases       # Duger raden globalt? Lagar, delar alternativ i sina led, rensar + backfill.
                            #   (Backfillen granskas inte — den skapar bara hushållsrader ur befintlig data.)
npm run clean:all           # Alla varunamn. Du döper om, tar bort eller låter vara. Inga gissningar.
npm run repair:categories   # Rättar varor som fastnat i Övrigt utan att någon valt det.
npm run category-gaps       # Rapport: namn ingen kategoriregel känner igen. Läser bara.
npm run clean:recipes       # Översätter engelska ingrediensnamn i redan sparade recept.
npm run fix:units           # Icke-svenska enheter i listor och basvaror ("teaspoon" → "tsk").
```

Flaggor värda att känna till:

```bash
npm run clean:all -- --översätt        # fyller i svensk översättning för engelska namn
npm run clean:all -- --radera-dolda    # tar bort rader som ändå aldrig föreslås
npm run repair:categories -- --kurerad # jämför HELA poolen mot reglerna — läs som rapport, applicera inte rakt av
```

### Arbetsgång

```bash
npm run clean:all                                        # 1. se läget
npm run clean:all -- --fil alla.txt                      # 2. skriv till fil
notepad alla.txt                                         # 3. granska
npm run clean:all -- --från-fil alla.txt --apply         # 4. tillämpa dina val
```

I filen börjar varje rad med `ja`. Ändra till `nej` för att låta varan vara,
eller skriv över BLIR-kolumnen med det värde du vill ha — ditt värde gäller,
inte skriptets förslag. I `clean:all` betyder **borttagen rad att varan
raderas**; i de andra skripten betyder `nej` bara att förslaget hoppas över.
Dina `nej` sparas i `.nej-lista.txt` och föreslås inte igen.

Recept och inköpslistor rörs aldrig — bara ordförrådet och hushållens basvaror.
`[eget val]` i filen markerar rader där ett hushåll själv satt kategori.

### Mot produktion

Skripten läser `DATABASE_URL`. **Railways interna adress
(`postgres.railway.internal`) går inte att nå från din dator** — använd
`DATABASE_PUBLIC_URL` (`...proxy.rlwy.net:PORT`) från Railway → Postgres →
Variables. Skripten skriver ut vilken databas de pratar med på första raden och
avbryter med en förklaring om de får den interna.

Ta alltid `npm run backup` först. Ordningen spelar roll, eftersom varje steg
ändrar underlaget för nästa:

```
clean:prefix → clean:junk → clean:dupes → clean:names → clean:aliases → clean:all → repair:categories
```

Tanken bakom ordningen:

1. **clean:prefix** först — mekaniskt och utan gissningar. "kg potatis" ska
   vara "potatis" innan något annat skript får syn på raden.
2. **clean:junk** tar bort det som inte är varor alls, så resten av passen
   slipper fundera på receptstycken.
3. **clean:dupes** slår ihop varianter medan de fortfarande är många — efter
   att namnen kortats ser två varianter ofta redan likadana ut.
4. **clean:names** kortar långa namn. Här föreslår AI, så kör det när det
   mesta uppenbara redan är borta.
5. **clean:aliases** städar poolen och fyller i hushållsräkningen.
6. **clean:all** är den manuella genomgången av det som återstår.
7. **repair:categories** sist, när bara riktiga varunamn finns kvar.

`category-gaps` är en rapport vars åtgärd är en kodändring i
`categorizeIngredient.ts`, inte i databasen. `clean:recipes` och `fix:units`
är egna spår (receptens namn respektive enheter) och kan köras när som helst.

Ett avbrutet pass går att köra om med samma granskningsfil: skripten klagar
inte på rader som redan är åtgärdade.

## Deploy

Se **[DRIFT.md](DRIFT.md)** för konton, hemligheter, löpande tillsyn och återställning från backup.

### Backend (Railway)

Push till `main` → GitHub Actions deployar till Railway. Migreringar körs automatiskt vid
boot i `backend/scripts/start-prod.mjs` — du kör dem inte för hand.

```bash
git checkout main
git merge develop --no-ff
git push origin main
```

**Ta en backup före en deploy som innehåller en ny Prisma-migrering** — Railway Hobby har
inga automatiska backuper:

```powershell
$env:BACKUP_DATABASE_URL = "postgresql://..."   # DATABASE_PUBLIC_URL i Railway
npm run backup --workspace=backend
```

### App (OTA via EAS Update)

```bash
npm run update:production --workspace=app
```

Scriptet sätter prod-URL:erna själv via `EXPO_NO_DOTENV=1`. **Redigera aldrig `app/.env` för
att styra vilken backend bundlen pekar på** — den läses inte vid en prod-OTA, och ändringen
läcker i stället in i nästa dev-körning.

Kanalen är alltid `production`; `preview` är onåbar eftersom `app.json` hårdkodar
channel-headern.

`runtimeVersion` följer `version` i `app.json`. En OTA når bara binärer med samma
runtime-version — bumpar du `version` krävs ett nytt nativebygge innan OTA:n gör nytta.

### Nativebygge (Android)

EAS-byggkvoten är slut. Kör **inte** `eas build`.

1. Bumpa `version` **och** `android.versionCode` i `app/app.json`
2. GitHub Actions → **android-release-build** → Run workflow
3. Ladda ner AAB-artefakten → Google Play Console

Missas `version`-bumpen drar den nya binären förra runtime-versionens OTA och skriver över
själva native-ändringen.

### Databasbackup

```powershell
npm run backup --workspace=backend                    # dump till backend/backups/
npm run backup --workspace=backend -- --schema-only   # bara struktur, ingen persondata
npm run backup --workspace=backend -- --encrypt       # AES-256-GCM, BACKUP_PASSPHRASE
npm run restore-test --workspace=backend              # återställ till engångscontainer
```

Skarp återställning: [DRIFT.md § 6](DRIFT.md).
