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
npm test --workspace=backend          # vitest, 20 tester (mergeLogic + unitOrder)
npm test --workspace=backend -- --watch
```

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
