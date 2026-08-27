# Handlis – Produktions-checklista

Status per 2026-08-27. Grundad på kodgranskning + BACKLOG.md. Kryssa av allteftersom.

---

## P0 – innan/vid beta (debugbarhet & efterlevnad)

- [~] **Sentry (app + backend)** – kod klar, aktiveras via DSN. Free-tier (Error monitoring only).
      - [x] `@sentry/react-native` i app + gated `Sentry.init` i `_layout`; DSN wire:ad i eas.json + `build:web`
      - [x] `@sentry/node` i backend + capture i felmiddleware + unhandledRejection
      - [x] Web-Sentry: aktiv efter Render-rebuild (DSN i `build:web`)
      - [ ] **Native-Sentry: aktiveras med nästa EAS-bygge** (native-modul; DSN i eas.json). Lägg in DSN i
            `update:preview`/`update:production` FÖRST när modul-lösa builds är utfasade (annars krasch).
      - [ ] **Backend: sätt `SENTRY_DSN` i Railway** → deploya om → verifiera testfel i dashboarden
- [ ] **Bekräfta Neon-backup / point-in-time-restore** på prod-DB innan riktiga användardata ligger där.
- [ ] **GDPR-cookiebanner för GA4** – vi laddar Google Analytics; EU-användare behöver samtycke innan gtag körs.
      (Alternativ: byt GA4 mot cookie-lös analytics, t.ex. Plausible, och slippa bannern.)
- [ ] **Klientfel-synlighet i prod** – täcks av Sentry ovan. (In-app-viewern är nu `__DEV__`-only + minnesring töms vid omstart.)

## P1 – under beta (drift & stabilitet)

- [ ] **Lågfrekvent DB-/uppetidslarm** – gles extern koll (1–2 ggr/dygn) mot `/health` som mejlar vid 500.
      Idag får vi ingen signal om backend/DB går ner. (cron-job.org eller UptimeRobot.)
- [ ] **Beslut: always-on backend** – Railway/Neon free-tier autosuspendar; keepalive-cron mildrar kallstart
      men är inte "alltid live". Uppgradera till betald tier inför riktig lansering.
- [ ] **Graceful "servern vaknar"-retry i appen** – auto-retry + backoff när `/healthz` är uppe men DB-anrop
      failar (Neon-väckning), i stället för råa fel. (WakeupIndicator finns – utvärdera om det räcker.)

## P2 – skala & perf (inte blockerande för liten beta)

- [ ] **SWR/React Query-cache** – `useFocusEffect` gör full reload vid varje flikbesök; stale-while-revalidate
      halverar upplevd laddtid.
- [ ] **Paginering för recept** – hela listan skickas vid varje besök; cursor + infinite scroll vid 60+ recept.
- [ ] **WS + Redis pub/sub** – realtiden är in-process; skalar backend till 2+ instanser slutar realtids-
      uppdateringar funka mellan användare på olika instanser.

## Google Play (pågår)

- [ ] AAB-bygge klart + uppladdat till **Closed testing**-spåret
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
