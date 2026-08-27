# Handlis – Produktions-checklista

Status per 2026-08-27. Grundad på kodgranskning + BACKLOG.md. Kryssa av allteftersom.

---

## P0 – innan/vid beta (debugbarhet & efterlevnad)

- [x] **Sentry BACKEND** — `@sentry/node` (kanonisk `instrument.ts`-init + `setupExpressErrorHandler` +
      unhandledRejection), `SENTRY_DSN` i Railway, **verifierat** (testfel landar i `handlis-backend`).
      Täcker det viktigaste: serverfel.
- [ ] **Sentry APP — UPPSKJUTET (borttaget under betan-crunchen).** `@sentry/react-native` avinstallerat för
      att det (1) bröt Google-OAuth på web (SDK:ns fetch/history-instrumentering krockade med Clerk-redirect)
      och (2) failade AAB-bygget (`…_SentryUpload`-task utan auth-token). Återinför EFTER betan, korrekt: bygg
      i preview-APK + testa OAuth först; Sentry.init utan fetch/history-instrumentering; `SENTRY_AUTH_TOKEN`
      + org/project för source maps. (Klientfel POST:as fortfarande till backend; ErrorBoundary härdad mot vit skärm.)
- [~] **Neon-backup / PITR** – bekräftat: PITR (instant restore) ÄR backupen, automatisk. **Free = bara 6h
      fönster** (default=max, cap 1 GB) → ok för betan (testdata), men tunt för riktig användardata.
      Inför launch: **uppgradera Neon till Launch (~$19/mån) → 7 dagars PITR + always-on** (löser backup +
      always-on-punkten ihop). Gratis-alternativ: schemalagt `pg_dump`-jobb (kräver säker lagring). OBS:
      EN delad DB för alla klienter (app/PWA/web) → PITR återställer allas data samtidigt.
- [x] **GDPR-cookiebanner för GA4** – GA4/gtag laddas nu ENDAST efter cookie-samtycke (Acceptera/Avvisa,
      val i localStorage, varumärkesgrön banner). Ingen GA-cookie innan samtycke. (`patch-index-html.mjs`)
- [ ] **Klientfel-synlighet i prod** – täcks av Sentry ovan. (In-app-viewern är nu `__DEV__`-only + minnesring töms vid omstart.)

## P1 – under beta (drift & stabilitet)

- [x] **Lågfrekvent DB-/uppetidslarm** – GitHub Actions-workflow (`.github/workflows/uptime.yml`) pingar
      `/health` var 6:e h (retry mot Neon-kallstart) → failar + mejlar repo-ägaren vid ihållande fel.
      Kör manuellt via Actions → Uptime → Run workflow för test.
- [ ] **Beslut: always-on backend** – Railway/Neon free-tier autosuspendar; keepalive-cron mildrar kallstart
      men är inte "alltid live". Uppgradera till betald tier inför riktig lansering.
- [x] **Graceful "servern vaknar"-retry i appen** – retry+backoff (1.5/4/9s, idempotenta anrop) fanns redan,
      MEN WakeupIndicator var frånkopplad (`trackBackendRequest` hade noll anropare → "Vaknar…" visades
      aldrig). Nu inkopplad i API-klienten → feedback under kallstart i stället för tyst ~14s.

## P2 – skala & perf (inte blockerande för liten beta)

- [ ] **SWR/React Query-cache** – `useFocusEffect` gör full reload vid varje flikbesök; stale-while-revalidate
      halverar upplevd laddtid.
- [ ] **Paginering för recept** – hela listan skickas vid varje besök; cursor + infinite scroll vid 60+ recept.
- [ ] **WS + Redis pub/sub** – realtiden är in-process; skalar backend till 2+ instanser slutar realtids-
      uppdateringar funka mellan användare på olika instanser.

## Google Play (pågår)

- [x] **AAB-bygge klart** (build 0fb8d9ba, versionCode 3) — funkade efter att app-Sentry togs bort.
      Ladda ner + ladda upp till **Closed testing** när Play-konto-verifieringen är klar.
- [ ] **12+ testare** inbjudna (mejl/Google-grupp), testar i **14 dagar** → ansök om produktion
- [ ] Store-listning: skärmdumpar (≥2 telefon), feature graphic ✓, copy ✓ (`app/store/`), kategori, kontaktmejl
- [ ] **Content rating**-enkät + **Data safety**-formulär (vägledning i `app/store/play-listing.md`)
- [ ] **OAuth-consent → Production** i Google Cloud Console (grund-scopes → ingen granskning) så alla kan Google-logga in
- [ ] Utvecklarnamn + utvecklarmejl satt (rek: "Handlis" / support@handlis.app om inkorgen läses)
- [x] versionCode auto-inkrement (EAS remote) + `update:production`-kanal

## Säkerhet – mestadels klart (verifierat i kod)

- [x] Clerk-JWT verifieras backend (`verifyToken` + `sk_live`)
- [x] helmet, CORS-allowlist (`CORS_ORIGIN`), rate limiting (200/15min + per-route), zod-validering
- [x] Felhanteraren läcker inte stacktraces; auditlogg för känsliga handlingar; `trust proxy`
- [x] Secrets i env (DB-URL-referens, `sk_live` i Railway); Postgres-lösen roterat
- [ ] **Clerk Bot Protection** – beslut: av (för att native passwordless-signup ska funka). Slå på igen +
      bygg captcha-hantering om spam-konton dyker upp (övervaka via Clerk → Users).
- [ ] **iOS** (senare): APNs-nyckel, bundle-registrering, TestFlight-smoketest

---

## Snabb prioritering
1. Sentry (störst hävstång för fjärr-felsökning)
2. DB-larm + bekräfta Neon-backup
3. GDPR-cookiebanner (GA4)
4. Play closed testing (pågår)
5. Perf (SWR, paginering) + WS+Redis vid faktisk skalning
