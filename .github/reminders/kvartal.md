Kvartalsvis tillsyn enligt [DRIFT.md](https://github.com/joamel/veckis/blob/main/DRIFT.md) § 3.

- [ ] **Cloudinary** → lagringskvot och bandbredd
- [ ] **Clerk** → Users: skräp- och testkonton. Kör `npx tsx backend/scripts/cleanup-members.ts --orphans --test-data` (dry-run som default, `--apply` raderar på riktigt)
- [ ] **Play Console** → policyvarningar eller krav som väntar
- [ ] Stämmer tjänstetabellen i DRIFT.md fortfarande? Nya konton, ändrade planer, roterade nycklar?

Stäng issuet när allt är genomgånget.
