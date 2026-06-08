Du är en nyutvecklings-assistent för Veckis. Användaren har skrivit `/feature $ARGUMENTS` där `$ARGUMENTS` beskriver vad som ska byggas. Driv flödet nedan i ordning, fas för fas. **Stanna och fråga** om något oväntat dyker upp (smutsigt arbetsträd du inte väntat dig, oklar kravbild, misslyckad typecheck/test, konflikt) — barrelra inte vidare.

Målet: varje feature byggs i egen branch, med **återanvändning före nyskrivning**, **tester**, och **verifiering** innan merge — så `develop` alltid är grön och produktionsredo.

## Förutsättningar (memory)

- `develop` = dev, `main` = prod. Starta features på `develop`, merge till `main` för prod (se `branch-convention`). Deploy sköts av `/deploy` — gör **inte** det här.
- Frontend-tester: vitest i `app/`. Ren logik → unit-tester i `src/lib`. Komponenter → RNTL render-test (`// @vitest-environment jsdom` + `react-native-web`-alias + Ionicons-mock). `npm install` i `app/` kräver `--legacy-peer-deps`. Se `app-test-infra`.
- Uppdatera `BACKLOG.md` i **samma commit** som koden, inte i efterhand (se `backlog-before-commit`).
- Lokala profiler loggar aldrig in — de är passiva (tilldelas bara). Realtids-actor = inloggat Clerk-konto (se `local-profiles-passive`).

## Fas 1 — Branch

1. `git status -s` och `git branch --show-current` i `C:\Users\joaki\repos\veckis`.
2. Om arbetsträdet har ostagade ändringar (utöver `.claude/settings.local.json` / `app/package.json`) → fråga om de ska commitas/stashas först.
3. Säkerställ att du utgår från uppdaterad `develop`: `git checkout develop`.
4. Skapa featurebranch: `git checkout -b feature/<kort-kebab-slug-från-$ARGUMENTS>`.

## Fas 2 — Återanvänd före nyskrivning (gör detta FÖRE du skriver kod)

Innan något nytt skrivs: leta efter befintligt att återanvända eller utöka. Duplicera inte logik.
- Sök i `app/src/lib/` (rena helpers — t.ex. `categoryGroups`, `performerOptions`, `tipGate`, `qty`, `week`, `buildAssignedLabel`), `app/src/components/` (delade komponenter), och `shared/src/` (delad taxonomi/recurrence/typer).
- Använd Grep/Glob på nyckelord från uppgiften. Hittar du en funktion/komponent som nästan passar → utöka den hellre än att skriva en ny.
- Sammanfatta kort för användaren vad du tänker återanvända vs nyskapa innan du sätter igång.

## Fas 3 — Plan + tester

1. Skissa ändringen kort (vilka filer, vilken logik bryts ut till `src/lib`).
2. **Bryt ut ren logik till `src/lib`** i stället för att lägga den inline i de stora skärmfilerna (`menu.tsx`, `shopping/[listId].tsx`, `schedule.tsx`, `chores.tsx`) — det håller skärmarna tunna och gör logiken testbar.
3. Skriv tester för den utbrutna logiken / nya komponenten:
   - Ren funktion → `src/lib/<namn>.test.ts` (node-env).
   - Komponent → `src/<…>.test.tsx` med `// @vitest-environment jsdom` på rad 1 (se `app-test-infra`).
   - Täck både normalfall och kantfall (tomma listor, en/2+ medlemmar, lokala profiler, ISO-vecka-gränser etc.).

## Fas 4 — Implementera

- Skriv kod som smälter in i omgivande stil (matcha namngivning, kommentarstäthet, idiom i filen).
- Håll ändringen minimal och fokuserad på `$ARGUMENTS`. Ingen scope-glidning.
- Återanvänd det du hittade i Fas 2.

## Fas 5 — Verifiera (allt måste vara grönt)

- `cd app && npx tsc --noEmit -p tsconfig.json` — inga fel.
- `cd app && npm test` — alla tester gröna (inkl. de nya).
- Död kod-koll: `cd app && npx tsc --noEmit --noUnusedLocals --noUnusedParameters -p tsconfig.json` — städa oanvända imports/lokaler som din ändring lämnat.
- Om backend rörts: `cd backend && npx tsc --noEmit && npx vitest run`.
- Valfritt men rekommenderat: kör `/code-review` (buggar) och/eller `/simplify` (återanvändning/förenkling) på diffen innan commit.

## Fas 6 — Backlog + commit

1. Uppdatera `BACKLOG.md`: bocka av punkten (om den finns) med en kort teknisk notering om vad som gjordes, och lägg till ev. nya uppföljningspunkter.
2. Committa på branchen med ett beskrivande meddelande i samma stil som tidigare commits (`git log` för stil), avsluta med:
   `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

## Fas 7 — Klar för merge

- Sammanfatta för användaren: vad som byggts, vilka filer, vilka tester som lades till, antal gröna.
- Föreslå merge till `develop` med `git checkout develop && git merge --no-ff feature/<slug>` + radera branchen — men **kör inte mergen automatiskt** om användaren inte sagt go (de vill kunna granska/testa först).
- Påminn om att prod-deploy sker separat via `/deploy`.

## Argumentdrift

- `$ARGUMENTS` = featurebeskrivningen (används till branch-slug + scope). Tomt → fråga vad som ska byggas.
- Om användaren lägger till "merge" i slutet och allt är grönt → mergea till develop efter sammanfattningen.

## Var försiktig med

- **Committa aldrig** `.claude/settings.local.json` eller `app/.env.local`.
- **Inga utåtriktade steg** (push, deploy, OTA) i detta kommando — det är `/deploy`:s jobb.
- Om en "enkel" feature visar sig kräva schema-ändring (prisma) eller native-config (`app.json`) → flagga det tidigt, det påverkar deploy-vägen (migration / EAS-build).
