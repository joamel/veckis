# Drift — konton, tjänster och vad som kan gå sönder

Enda stället som listar VAR saker ligger och VAD som kräver tillsyn. Engångsuppgifter inför
och efter lansering står i PROD_CHECKLIST.md. Kodnära detaljer hör hemma
i README.md; öppna uppgifter i BACKLOG_AFTER_PROD.md. Uppdatera den här filen när en tjänst
tillkommer, byter plan eller när en nyckel roteras.

Senast granskad: 2026-09-10 (Railway uppgraderad till Hobby samma dag).

---

## 1. Tjänster

| Tjänst | Vad den gör | Plan / kostnad | Går sönder om… |
|---|---|---|---|
| **Railway** | Backend (Express+Prisma) + Postgres, EU | Hobby, $5/mån minimum + förbrukning (sedan 2026-09-10) | **betalningen fallerar → HELA appen ligger nere**, DB fylls, public networking stängs av |
| **Render** | ENBART statiska webb-PWA:n (`app/dist`) | free | — (backenden ligger inte här längre) |
| **Anthropic Console** | `ANTHROPIC_API_KEY` → foto-import, ingrediensnormalisering, smart merge | pay-as-you-go, credits | **credits tar slut → AI-funktionerna dör tyst** |
| **Clerk** | Inloggning (`pk_live` / `sk_live`) + `user.deleted`-webhook | free tier | dev/prod-instanserna blandas, nyckel roteras fel |
| **Cloudinary** | Recept- och profilbilder | free tier | lagringskvot slut |
| **Sentry** | Backend-felrapportering (`handlis-backend`) | free tier | kvot slut → tappar felinsyn |
| **Google Play Console** | Distribution av Android-appen | $25 engång | versionCode ej bumpad, policykrav |
| **Google Cloud Console** | OAuth-consent för Google-inloggning | free | consent-screen kvar i Testing → bara testare kan logga in |
| **Google Analytics 4** | Webbstatistik, `G-XJG4FKTTSD` (handlis.app) | free | — |
| **Expo / EAS** | OTA-uppdateringar (`update:production`) | free tier | **byggkvoten är slut → native byggs via Gradle** |
| **GitHub** | Repo + Actions (ci, uptime, android-release-build) | free | Actions-minuter |
| **Domän `handlis.app`** | Webb + Clerk-domän | årsavgift | **förnyelse missas → både sajt och inloggning dör** |

Kontoägare för allihop: melander.joakim@gmail.com.

> **Railway-kostnad.** Hobby är ett *minimum* på $5/mån som inkluderar $5 förbrukning —
> ligger användningen över debiteras mellanskillnaden. Kostnaden drivs av att backend och
> Postgres står på dygnet runt (RAM-tid), inte av antalet användare; grov uppskattning ~$6–7/mån.
> Läs av den faktiska siffran i Railway → Usage efter första månaden. Blir det oväntat högt är
> det något som snurrar i onödan, inte fel plan.

**Claude Pro ≠ Anthropic API.** Pro täcker claude.ai och Claude Code. Appens AI-anrop går via
console.anthropic.com med separat fakturering. Pro ger noll API-credits.

---

## 2. Var ligger vilken hemlighet

| Variabel | Ligger i | Kommer från |
|---|---|---|
| `DATABASE_URL` | Railway | Railway Postgres |
| `CLERK_SECRET_KEY` | Railway | Clerk → API keys (prod-instansen) |
| `CLERK_WEBHOOK_SECRET` | Railway | Clerk → Webhooks → endpointens signing secret |
| `ANTHROPIC_API_KEY` | Railway | console.anthropic.com → API keys |
| `CLOUDINARY_*` | Railway | Cloudinary dashboard |
| `SENTRY_DSN` | Railway | Sentry → projekt `handlis-backend` |
| `CORS_ORIGIN` | Railway | sätts manuellt |
| `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | **npm-scripten i `app/package.json`** | inte hemliga; INTE `app/.env` |

Prod-URL:erna sätts av scripten via `EXPO_NO_DOTENV=1`. Ändra aldrig `app/.env` för att
fixa en prod-URL — den läses inte.

---

## 3. Återkommande tillsyn

**Varje månad**
- Anthropic → Usage + Billing. Saldo kvar? Sätt auto-reload eller usage-limit.
- AI-kostnaden bokförs automatiskt per månad i tabellen `AiUsage` och larmar via Sentry när
  den passerar 100 kr. Månadskontrollen ovan är alltså ett skyddsnät, inte enda försvaret.
- Enskild användare kan max tolka 50 foton per månad (`PhotoQuota`). Skyddar de andra
  användarna: larmet ovan går först efter att pengarna spenderats.
- Railway → förbrukning och DB-storlek.
- Sentry → nya felmönster.

**Varje kvartal**
- Cloudinary-kvot.
- Clerk → Users: skräpkonton (`backend/scripts/cleanup-members.ts --orphans --test-data`, dry-run som default).
- Play Console → policyvarningar.

**Datumbundet (kollas dagligen, larmar i förväg)**
- Domänförnyelse `handlis.app`, kortens giltighet, Play-kontoverifiering.
- Datumen står i `.github/reminders/forfallodatum.tsv` — **fyll i de riktiga**, platshållarna där larmar om fel dag.

Allt ovan öppnar automatiskt ett GitHub Issue via `.github/workflows/maintenance-reminders.yml`.
Google OAuth-consent (ska stå i Production, inte Testing) sitter i kvartalslistan.

---

## 4. Fallgropar som redan bitit oss

- **Clerk-nyckelrotation.** Testa den nya nyckeln MOT Clerks API innan den läggs i Railway och
  den gamla tas bort. Railway plockar inte alltid upp ett nytt värde — spara om variabeln så
  processen startar om, och verifiera med ett riktigt inloggat anrop.
- **`pk_live` och `sk_live` måste tillhöra samma Clerk-instans**, annars 401 överallt (JWKS-kid matchar ej).
- **`runtimeVersion` följer `version` i app.json.** Bumpa alltid `version` OCH `android.versionCode`
  före ett nativebygge — annars drar den nya binären förra runtime-versionens OTA och skriver över
  själva native-ändringen.
- **OTA går bara via `npm run update:production`.** Kanalen `preview` är onåbar (app.json hårdkodar
  channel-headern till `production`).
- **Native byggs manuellt**: GitHub Actions → `android-release-build` → AAB-artefakt → Play Console.
  EAS-byggkvoten är slut, kör inte `eas build`.
- **Railway**: public networking PÅ för backend, AV för Postgres.
- **Railway Hobby har inga automatiska backuper.** `npm run backup --workspace=backend`
  är hela skyddsnätet. `cleanup-members.ts --apply` tar en dump själv innan den raderar.
  Ta en manuellt innan deploys med nya Prisma-migreringar.
- **Anthropic-credits slut** = foto-import, normalisering och smart merge slutar fungera. Backend
  svarar som om AI vore avstängd, utan tydligt fel i UI:t.

---

## 5. Släppkedjan

| Ändring | Väg | Når användaren |
|---|---|---|
| Bara JS/TS i `app/` | push `main` → `npm run update:production` | direkt vid omstart av appen |
| Backend | push `main` → GitHub Actions deployar till Railway | direkt |
| Webb-PWA | `npm run build:web` → Render | vid deploy |
| Nya native-beroenden | bumpa `version` + `versionCode` → Actions-bygge → Play | efter Google-granskning |

---

## 6. Återställa från backup

Dumparna är ren SQL, gzippad, eventuellt krypterad. Filnamnet bär allt du behöver
veta: `handlis-<tidpunkt>[-schema]-pg<version>.sql.gz[.enc]`.

### Ta en backup

```powershell
$env:BACKUP_DATABASE_URL = "postgresql://...@....proxy.rlwy.net:PORT/railway"   # DATABASE_PUBLIC_URL
npm run backup --workspace=backend

# Ska filen lämna din maskin (molnsynk, USB, extern lagring):
$env:BACKUP_PASSPHRASE = "lång lösenfras ur lösenordshanteraren"
npm run backup --workspace=backend -- --encrypt
```

Filerna hamnar i `backend/backups/` (gitignorerad). De 14 senaste sparas; krypterade,
okrypterade och schema-dumpar roteras var för sig så de inte tränger undan varandra.

### Verifiera att en dump duger

```powershell
npm run restore-test --workspace=backend          # senaste dumpen
npm run restore-test --workspace=backend -- backups/handlis-....sql.gz.enc
```

Startar en engångscontainer, återställer dit, rapporterar radantal per tabell och river
containern. **Produktionsdatabasen rörs aldrig.** Gör det efter varje backup du tänker
förlita dig på — en dump som aldrig återställts är en gissning.

### Skarp återställning

Det finns **ingen knapp**. Så här går det till, och stegen är manuella med flit:

1. **Stoppa skrivningar.** Pausa backend-tjänsten i Railway. Återställer du under pågående
   trafik skriver användarna in data i en databas du håller på att skriva över.
2. **Skapa en TOM databas.** Dumpen innehåller `CREATE TABLE` men inte `DROP` — den vägrar
   in i en databas som redan har tabellerna. Lägg till en ny Postgres-tjänst i Railway i
   stället för att tömma den befintliga: då finns originalet kvar om återställningen
   misslyckas.
3. **Packa upp** (och dekryptera om `.enc`):
   ```powershell
   # okrypterad
   node -e "require('zlib').gunzip(require('fs').readFileSync('dump.sql.gz'),(e,d)=>require('fs').writeFileSync('dump.sql',d))"

   # krypterad — samma lösenfras som vid backupen
   $env:BACKUP_PASSPHRASE = "..."
   node -e "const c=require('./backend/scripts/backup-crypto.mjs'),f=require('fs'),z=require('zlib');f.writeFileSync('dump.sql',z.gunzipSync(c.dekryptera(f.readFileSync('dump.sql.gz.enc'),process.env.BACKUP_PASSPHRASE)))"
   ```
4. **Läs in i den nya databasen** — versionen i filnamnet avgör avbilden:
   ```powershell
   docker run --rm -i postgres:18 psql "<nya DATABASE_PUBLIC_URL>" -v ON_ERROR_STOP=1 < dump.sql
   ```
5. **Kontrollera radantal** mot vad `restore-test` rapporterade för samma dump.
6. **Peka om `DATABASE_URL`** i backend-tjänsten till den nya databasen och starta den.
7. **Verifiera i appen** — logga in, öppna en inköpslista, lägg till en vara.

Behåll den gamla databasen några dagar innan du raderar den.

### Vad återställningen INTE tar med

- **Cloudinary-bilder.** De ligger utanför databasen. `imagePublicId` i dumpen pekar på
  dem; finns bilden kvar hos Cloudinary funkar den, annars är den borta.
- **Clerk-konton.** Användarna finns hos Clerk, inte hos oss. `clerkUserId` i dumpen
  kopplar ihop dem. Raderas ett Clerk-konto hjälper ingen databasbackup.

### Om lösenfrasen är borta

Då är den krypterade dumpen förlorad. AES-256-GCM går inte att forcera. Det är hela
poängen — och därför hör frasen hemma i lösenordshanteraren, inte i huvudet och inte i
samma mapp som dumparna.
