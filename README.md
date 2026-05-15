# Veckis

Hushållsapp för meny, sysslor, kalender och inköpslistor.

## Workspace-struktur

- `app/` — Expo/React Native-klient
- `backend/` — Express + Prisma + Postgres
- `shared/` — delade typer

## Branches

- `develop` — utveckling, frontenden pekar mot `localhost:3000`
- `main` — produktion, frontenden pekar mot `https://veckis.onrender.com`

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

## Manuell deploy

### Backend (Render)

Render auto-deployar `main`. För att rulla ut backend-ändringar:

```bash
git checkout main
git merge develop --no-ff
git push origin main
```

Render plockar upp pushen och bygger om. Följ deployen i Render-dashboarden.

För migrations som ska köras mot prod-DB:

```bash
npm run db:migrate:prod
```

### App (Expo OTA via EAS Update)

Frontenden distribueras som OTA-uppdatering på kanalen `preview` (matchar EAS-builden i `app/eas.json`).

⚠️ `eas update` bakar in env från `.env`/`.env.local` i bundlen och **ignorerar** både `eas.json`-profilens env och `EXPO_NO_DOTENV=1`. Inför en OTA måste prod-värden ligga i `.env` direkt:

```bash
cd app
# Byt bort dev-env temporärt
mv .env.local .env.local.bak
mv .env .env.bak
cat > .env <<EOF
EXPO_PUBLIC_API_URL=https://veckis.onrender.com
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY="<clerk-publishable-key>"
EOF

# Rensa cache så gamla strängar inte hänger med
rm -rf dist node_modules/.cache .expo/cache

eas update --channel preview --message "Kort beskrivning" --clear-cache

# Återställ dev-env
rm .env
mv .env.bak .env
mv .env.local.bak .env.local
```

Verifiera att rätt URL hamnade i bundlen genom att grepa `veckis.onrender.com` i den nedladdade `.hbc`-filen från `https://u.expo.dev/<projectId>`-manifestet.

Användare med en installerad preview-build får uppdateringen vid nästa app-start. Runtime-version styrs av `appVersion` i `app.json` — om du bumpar `version` där behöver du göra en ny native-build innan OTA fungerar.

Ny native-build (om beroenden ändrats eller version bumpats):

```bash
cd app
eas build --profile preview --platform android   # eller ios
```

### Sammanfattad rutin

1. Verifiera att `develop` är grön lokalt
2. `git checkout main && git merge develop --no-ff && git push origin main` → backend deployar
3. `cd app && eas update --channel preview -m "..."` → app OTA
4. `git checkout develop` för att fortsätta arbeta
