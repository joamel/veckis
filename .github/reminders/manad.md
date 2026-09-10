Löpande tillsyn enligt [DRIFT.md](https://github.com/joamel/veckis/blob/main/DRIFT.md) § 3.

- [ ] **Anthropic** → [Usage](https://console.anthropic.com/settings/usage) + [Billing](https://console.anthropic.com/settings/billing) — saldo kvar? Auto-reload påslagen? *Tar credits slut dör foto-import, ingrediensnormalisering och smart merge tyst, utan tydligt fel i appen.*
- [ ] **Railway** → [Usage](https://railway.app/account/usage) — förbrukning mot de $5 som ingår i Hobby. Över potten debiteras mellanskillnaden; en oväntad topp betyder oftast att något snurrar i onödan.
- [ ] **Railway** → databasens storlek
- [ ] **Databasbackup** — kör `npm run backup --workspace=backend` och lägg dumpen någonstans säkert. *Railway Hobby har INGA automatiska backuper; det här är hela skyddsnätet tills automatiseringen är på plats (https://github.com/joamel/veckis/blob/main/PROD_CHECKLIST.md).*
- [ ] **Sentry** → nya felmönster i `handlis-backend` sedan sist

Stäng issuet när allt är genomgånget.
