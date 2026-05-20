Du är en deploy-assistent för Veckis. Användaren har skrivit `/deploy $ARGUMENTS`. Följ stegen nedan i ordning. Stoppa och fråga om något oväntat händer (oconfirmed changes, conflict, failed test, backend ohealthy).

## Förutsättningar (memory)

- `develop` = dev (localhost), `main` = prod (`veckis.onrender.com`). Render auto-deployar `main` och kör `prisma migrate deploy` i `startCommand` (se `render.yaml`).
- `app/.env.local` har dev-IP — **ALDRIG** kör `eas update` direkt utan att hoppa över `.env.local`. Använd alltid `npm run update:preview` i `app/`-katalogen, som har `EXPO_NO_DOTENV=1` + explicit prod-URL via `cross-env`.
- `tsx watch` på Windows är opålitlig — efter prisma-migrationer dödar vi backend och startar om manuellt om vi behöver verifiera lokalt.

## Steg

**1. Kolla läget.** Kör:
- `git status -s` i `C:\Users\joaki\repos\veckis`
- `git log develop --oneline -5`
- `git log main --oneline -3`

Om det finns ostagade ändringar utöver `.claude/settings.local.json` och `app/package.json` → fråga användaren om de ska commitas innan deploy. (Settings-filen ska aldrig in i commit; den stashas.)

**2. Backend-tester** (om någon backend-fil ändrats sedan main):
- `cd backend && npx tsc --noEmit` (typecheck)
- `npx vitest run` (alla tester ska passera)

Om fel: rapportera och stanna.

**3. Frontend-typecheck**: `cd app && npx tsc --noEmit`. Om fel: rapportera och stanna.

**4. Committa pending changes på develop** om det finns relevanta. Använd en sammanfattande meddelande i samma stil som tidigare commits (se `git log` för stil). Pusha develop.

**5. Merge till main:**
   - `git stash push -m "settings.local before main merge" .claude/settings.local.json app/package.json` (skippa fil-skräp)
   - `git checkout main`
   - `git pull origin main` (om "cannot pull with rebase" pga ostagade ändringar → stasha även dem)
   - `git merge develop --no-ff -m "Merge develop: <kort sammanfattning från commit-meddelandena>"`
   - `git push origin main`

**6. Återgå till develop:**
   - `git checkout develop`
   - `git stash pop` (en eller två gånger beroende på hur många stash:ar som skapats)

**7. Verifiera prod-deploy:** Vänta ~2-3 min och pinga `https://veckis.onrender.com/health` (PowerShell `Invoke-WebRequest`, timeout 60s). Om 200/ok = backend live med ny migration. Om timeout: render kan vara mitt i bygget — pinga igen om 1-2 min.

**8. Skicka OTA till mobilappen** (om frontend-ändringar finns):
   - `cd app && npm run update:preview`
   - **Aldrig** köra `eas update` direkt utan `EXPO_NO_DOTENV=1` (se `feedback-eas-update` memory)
   - Vänta på "Published!" + Update group ID
   - Rapportera URL till EAS dashboard

**9. Sammanfatta för användaren:**
   - Vilka commits som mergades till main
   - Health-status (200/timeout)
   - OTA update group ID + dashboard-länk
   - Vad användaren behöver göra på telefonen (stäng appen, öppna igen) om OTA skickades

## Argumentdrift

`$ARGUMENTS` kan användas för att specificera vad som ska deployas:
- `backend` — bara backend (merge + push main, ingen OTA)
- `frontend` — bara OTA (ingen merge — gör bara om develop redan är mergad)
- `all` eller tomt — full deploy (merge + push + OTA)

## Var försiktig med

- **Migrations**: Render kör `prisma migrate deploy` automatiskt. Verifiera att alla migrations finns committade i `backend/prisma/migrations/`. Om du ser en ny `*_init*` eller suspicious file → fråga.
- **`app/.env.local`**: får ALDRIG committas. Om den visas i status, kontrollera om den är ny eller bara modifierad.
- **Push till main**: skickar livekod till produktion. Bekräfta innan om något känns osäkert.
