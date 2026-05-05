# Veckis — Backlog

## UI-förbättringar/buggar

### Generellt
- [x] Kunna ha appen i horisontalläge i tablet-format (tablet-format supporteras, portrait-first på phone)
- [x] Skärmen borde hoppa upp när man ska skriva in något så man ser vad man skriver
- [x] Snyggt om man kan hålla inne på inköpslistor/aktiviteter/sysslor/meny så att de skakar om man vill redigera dem och att det kommer upp en delete (x) /redigeringsknapp (penna)
- [x] Emoji bakom hushållsnamnet saknas i inköps- och meny-fliken

### Inställningar
(Nyligen implementerat)

### Inköpslistan
- [ ] Kunna redigera butiker direkt från inköpsfliken, både butikens namn och redigera, lägga till och ta bort kategorier. Gör den som "recept"-knappen i meny-fliken
- [ ] När man lägger till en inköpslista borde man kunna välja butik direkt -> skapa butik om den inte finns
- [ ] Även kunna redigera namnet på ingrediensen när man long pressar
- [ ] Försöka slå ihop ingredienser även om de har olika mått (2 dl + 1,5 msk osv) och namn (mjölk <=> standardmjölk osv)
- [ ] Om man vill lägga till egen vara i inköpslistan borde den söka på befintliga för att underlätta tilläggning, samt lägga till varan i d2atabasen om den inte redan finns (förutsatt att man lägger till en kategori)
- [ ] Byt punkt mot komma i ingredienser (1.5 tsk -> 1,5 tsk)
- [ ] Lägga till basvara med mängd +/- och förbestämd enhet med möjlighet att ändra
- [ ] Gemener när man skriver in Ingredienser mm. Även basvaror bör vara med gemener
- [ ] Kunna skapa en inköpslista när man trycker att man vill överföra till inköpslista
- [ ] Ha kvar sökfältet när man klickar på basvaruknappen
- [ ] Tar man bort maträtt från inköpslista tas inte ingredienser bort som även delas med andra recept (Ex: 4 ägg i inköpslistan ligger kvar om man tar bort pannkakor [3 av 4 äggen])
- [ ] Möjlighet att rensa inköpslista när man är klar istället för att arkivera den

### Meny
- [ ] Varna om man lägger till samma rätt igen under samma veckomeny
- [ ] Har man samma rätt två gånger måste man kunna hålla reda på ingredienser som hör till rätt #1 och #2 för att sedan kunna ta bort/lägga till dem i inköpslistan
- [ ] Varna om man försöker flytta en befintlig rätt till en dag som redan har en rätt inlagd
- [ ] När man tar bort maträtt från inköpslista behöver man kunna välja lista om man har den inlagd på flera
- [ ] När man trycker lägg till inköpslistan och stannar kvar kommer man felaktigt in i receptet istället för att vara kvar i menyn
- [ ] "+" borde försvinna från en dag som redan har en rätt inlagd
- [ ] Knapp för att kunna överföra hela veckomeny till inköpslistan (kryssa ur om det är någon rätt man av någon anledning inte vill överföra)
- [ ] Lägg till alla dagar i menyn även om de är tomma så att det är lätt att lägga till rätt
- [ ] I menyn räcker det med veckonummer överst då vi har datumen per dag

### Kalendern
- [ ] Kunna välja heldag på en aktivitet
- [x] Kunna redigera en aktivitet genom att hålla inne på aktiviteten
- [ ] Kunna lägga aktiviteter på users
- [x] Kunna göra aktiviteter återkommande

### Sysslor
- [ ] Hela namnet i rubriker/headers syns fortfarande inte helt ("Daglige" -> "Dagligen", "Månadsvi" -> "Månadsvis", "Varannan" -> "Varannan vecka", "Engång" -> "En gång", "Joaki" -> "Joakim")

---

## Backlog (prioriterade features)

### Kalender

- [x] **Månadsvy på tablet** — Visa hela månaden som grid i kalender-fliken när skärmen är tillräckligt bred
- [x] **Redigera/ta bort events** — Tryck på event öppnar edit-modal. Ta bort-knapp. (Maträtt-event bör navigera till Meny, syssla-event till Sysslor)
- [x] **Upprepade events (serier)** — Välj upprepning när man skapar aktivitet: dagligen, varje vecka, specifika veckodagar (mån+ons+fre), månadsvis
  - [ ] Möjlighet att ta bort enstaka vs hela serien

### Sysslor

- [x] **Flera dagar per syssla** — Kunna välja t.ex. mån, ons och lör i samma syssla (idag är det bara en dag). Spara som array av WeekDay
- [x] **Klarmarkera och redigera** — Bocka av syssla likt inköpslistan (inline, inte bara via "slutför"-knapp). Redigera titel, frekvens, dag, person. Avklarade sysslor stryks över i kalendervy

### Meny

- [x] **Sortering mån→sön + tydlig dagmarkering** — Veckans meny sorteras kronologiskt. Varje dag har tydlig rubrik (Måndag 5 maj). Ej schemalagda visas sist
- [x] **Varning vid dubbel dag** — Om det redan finns en maträtt på en dag varnas användaren (men kan ändå lägga till)
- [x] **Datepicker för annan vecka** — Möjlighet att planera meny för valfri vecka, inte bara innevarande
- [x] **Smarter "till inköpslistan"** — Om maträtten redan är tillagd i aktiv inköpslista visas inte "till inköpslistan". Vid borttagning visas "ta bort från inköpslistan" om den finns där

### Inköpslistan

- [x] **Deduplicering av ingredienser** — Samma ingrediens (samma namn + enhet) adderas ihop vid transfer från meny istället för att bli dubbletter. (Delvis fixat för transfer, men kolla manuella tillägg också.)

### Inställningar

- [x] **Redigera hushåll** — Admin kan ändra hushållets namn. Se och ta bort medlemmar. Sätta smeknamn på sig själv
- [x] **Flera hushål** — Skapa och växla mellan flera hushål under inställningar (t.ex. eget + sommarstugan). Aktivt hushål sparas i context
- [x] **Profiler utan konto** — Skapa lokala profiler för barn/personer utan Clerk-konto. Kan tilldelas sysslor och chorer utan att logga in
