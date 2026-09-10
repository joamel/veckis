# Handlis – Produktions-checklista

**Appen är lanserad.** Play: 1.2.1 / versionCode 10. Kvarvarande punkter är drift- och
skalningsarbete, inte lanseringsblockerare.

Städad 2026-09-10 (ursprunglig status 2026-08-27). Kontoöversikt, hemligheter och löpande
tillsyn ligger i [DRIFT.md](DRIFT.md) — den här filen är engångsuppgifter.

---

## Öppet

### Backup av produktionsdatabasen — **den enda riktiga risken kvar**
Neon är avvecklat; DB:n ligger på **Railway Postgres** (Hobby sedan 2026-09-10). **Hobby har inga
automatiska backuper** — bekräftat 2026-09-10. Produktionsdatan har alltså inget skyddsnät i dag.

Verktyget finns: `npm run backup --workspace=backend` dumpar och gzippar till `backups/`
(gitignorerad). Kräver den publika TCP-proxy-URL:en från Railway → Postgres → Connect, satt som
`BACKUP_DATABASE_URL`. Kör pg_dump direkt om binären finns, annars via Docker.

**Skydd på plats:** `cleanup-members.ts --apply` tar numera en dump automatiskt innan den
raderar, och avbryter helt om dumpen misslyckas. Det täcker den troligaste katastrofen — att
vi själva kör något destruktivt mot prod — utan cronjobb och utan att exponera databasen.

Kvar:
- [ ] **Verifiera hela kedjan.** Börja med schemat, så lämnar ingen persondata Railway:
      ```powershell
      # PowerShell — variabeln sätts som eget kommando, inte som prefix (det är bash-syntax)
      $env:BACKUP_DATABASE_URL = "postgresql://...@....proxy.rlwy.net:PORT/railway"
      npm run backup --workspace=backend -- --schema-only
      npm run restore-test --workspace=backend
      ```
      Postgres-versionen upptäcks automatiskt (Railway kör 18.6) och bakas in i filnamnet,
      Strängen är `DATABASE_PUBLIC_URL` i Railway → Postgres → Variables. Den privata
      (`.railway.internal`) går inte att nå utifrån och avvisas av scriptet.
      Fungerar det, ta en full dump och kör `restore-test` igen. Den startar en
      engångscontainer, återställer dit och rapporterar radantal per tabell — produktions-
      databasen rörs aldrig. En dump som aldrig återställts är en gissning, inte en backup.
- [ ] Ta en dump manuellt innan varje deploy som innehåller en ny Prisma-migrering.
      Migreringar körs automatiskt vid boot i `start-prod.mjs` — det finns alltså ingen lokal
      punkt att haka fast en spärr i, det måste bli en vana.
- [x] **Kryptering finns** — `npm run backup --workspace=backend -- --encrypt` (AES-256-GCM,
      lösenfras ur `BACKUP_PASSPHRASE`). Verifierad rundtur: kryptera, dekryptera, återställa
      2512 rader. Återställningsrutin i DRIFT.md § 6.
- [ ] Var dumparna ska lagras långsiktigt. Ligger de bara på din maskin skyddar de mot att vi
      sabbar prod, men inte mot att maskinen dör. Kryptera när filen flyttas.
- [ ] Nattlig cron är möjlig senare, men ger bara frekvens — off-site-egenskapen kommer av
      var filen hamnar, inte av att en cron skapade den.

En delad DB för alla klienter (app/PWA/webb) → en återställning återställer allas data samtidigt.

### Sentry i appen — uppskjutet, medvetet
`@sentry/react-native` avinstallerat under lanseringsrusningen eftersom det (1) bröt Google-OAuth
på webben (SDK:ns fetch/history-instrumentering krockade med Clerk-redirect) och (2) fällde
AAB-bygget (`…_SentryUpload` utan auth-token).

Återinför i den här ordningen: bygg preview-APK → testa OAuth först → `Sentry.init` **utan**
fetch/history-instrumentering → `SENTRY_AUTH_TOKEN` + org/project för source maps.

Klientfel POST:as fortfarande till backend under tiden, och ErrorBoundary är härdad mot vit skärm.

### Google OAuth-consent → Production
Verifiera i Google Cloud Console att consent-skärmen står i **Production**, inte Testing. Står den
kvar i Testing kan bara uppräknade testare Google-logga in. Grund-scopes → ingen granskning krävs.

### iOS — inte påbörjat
APNs-nyckel, bundle-registrering, TestFlight-smoketest.

### Clerk Bot Protection — medvetet av
Avstängd för att native passwordless-signup ska fungera. Slå på igen och bygg captcha-hantering
om spam-konton dyker upp (övervaka via Clerk → Users; kvartalspunkt i DRIFT.md).

---

## Perf & skalning (ingen brådska, men kända)

- [ ] **Sammansatta endpoints** — flera flikar gör 2–4 parallella anrop per laddning (Meny =
      `getWeekMenu + getRecipes + getShoppingLists + getStores + getAllMenus`; Inköp =
      listor+butiker+medlemmar). En composite-endpoint per flik → 1 anrop, halverad latens.
      Största reella perf-vinsten som återstår på backendsidan.
- [ ] **Paginering för recept** — hela listan skickas vid varje besök; cursor + infinite scroll
      vid 60+ recept.
- [ ] **WS + Redis pub/sub** — realtiden är in-process. Skalas backend till 2+ instanser slutar
      realtidsuppdateringar fungera mellan användare på olika instanser. WebSockets är också det
      som driver RAM-kostnaden på Railway, se DRIFT.md.

---

## Klart

- [x] **Sentry backend** — `@sentry/node` (`instrument.ts` + `setupExpressErrorHandler` +
      unhandledRejection), `SENTRY_DSN` i Railway, verifierat mot `handlis-backend`.
- [x] **Uppetids-/DB-larm** — `.github/workflows/uptime.yml` pingar `/health` var 6:e timme med
      retry, failar och mejlar repo-ägaren vid ihållande fel.
- [x] **Always-on backend** — löst av Railway Hobby. Free-tiern autosuspenderade; det gör inte den
      betalda.
- [x] **"Servern vaknar"-retry** — retry+backoff (1.5/4/9 s, idempotenta anrop) inkopplad i
      API-klienten, `WakeupIndicator` faktiskt ansluten (den hade noll anropare tidigare).
- [x] **GDPR-cookiebanner för GA4** — gtag laddas enbart efter samtycke, val i localStorage
      (`patch-index-html.mjs`).
- [x] **Inköpslistans scrollprestanda** — FlashList + memoiserade rader, levererat i 1.2.1.
- [x] **Google Play — publicerad.** Stängd testning, 14 dagars testperiod, content rating,
      data safety och store-listning genomförda. Nu i produktion.
- [x] **Säkerhet** — Clerk-JWT verifieras i backend (`verifyToken` + `sk_live`); helmet,
      CORS-allowlist, rate limiting (200/15 min + per route), zod-validering; felhanteraren läcker
      inte stacktraces; auditlogg för känsliga handlingar; `trust proxy`; secrets i env;
      Postgres-lösenord roterat.
- [~] **SWR/React Query-cache — utredd och avskriven.** Tab-navigatorn saknar
      `unmountOnBlur`/`freezeOnBlur`, så skärmarna behåller state mellan flikbyten och persisterad
      data visas direkt medan `load()` revalideras i bakgrunden. Modul-cache testades för Recept
      och Inköp och **återställdes** — gav bara nytta vid faktisk ommontering, som knappt sker.
      Kvarvarande sub-värde: en kort staleness-guard mot redundanta on-focus-`load()`. Låg prio.

---

## Notera

Native-byggen görs **manuellt** via GitHub Actions → `android-release-build` → AAB → Play Console.
EAS-byggkvoten är slut, och `versionCode` inkrementeras därför inte automatiskt — bumpa `version`
**och** `android.versionCode` i `app/app.json` för hand före varje bygge. Missas `version` drar den
nya binären förra runtime-versionens OTA och skriver över själva native-ändringen.
