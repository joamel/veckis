# Veckis — Backlog

## Kalender

- **Månadsvy på tablet** — Visa hela månaden som grid i kalender-fliken när skärmen är tillräckligt bred.
- **Redigera/ta bort events** — Tryck på event öppnar edit-modal. Ta bort-knapp. Maträtt-event navigerar till Meny, syssla-event navigerar till Sysslor.
- **Upprepade events (serier)** — Välj upprepning när man skapar aktivitet: dagligen, varje vecka, specifika veckodagar (mån+ons+fre), månadsvis. Möjlighet att ta bort enstaka vs hela serien.

---

## Sysslor

- **Flera dagar per syssla** — Kunna välja t.ex. mån, ons och lör i samma syssla (idag är det bara en dag). Spara som array av WeekDay.
- **Klarmarkera och redigera** — Bocka av syssla likt inköpslistan (inline, inte bara via "slutför"-knapp). Redigera titel, frekvens, dag, person. Avklarade sysslor stryks över i kalendervy.

---

## Meny

- **Sortering mån→sön + tydlig dagmarkering** — Veckans meny sorteras kronologiskt. Varje dag har tydlig rubrik (Måndag 5 maj). Ej schemalagda visas sist.
- **Varning vid dubbel dag** — Om det redan finns en maträtt på en dag varnas användaren (men kan ändå lägga till).
- **Datepicker för annan vecka** — Möjlighet att planera meny för valfri vecka, inte bara innevarande.
- **Smarter "till inköpslistan"** — Om maträtten redan är tillagd i aktiv inköpslista visas inte "till inköpslistan". Vid borttagning visas "ta bort från inköpslistan" om den finns där.

---

## Inköpslistan

- **Deduplicering av ingredienser** — Samma ingrediens (samma namn + enhet) adderas ihop vid transfer från meny istället för att bli dubbletter. (Delvis fixat för transfer, men kolla manuella tillägg också.)

---

## Inställningar

- **Redigera hushåll** — Admin kan ändra hushållets namn. Se och ta bort medlemmar. Sätta smeknamn på sig själv.
- **Flera hushåll** — Skapa och växla mellan flera hushåll under inställningar (t.ex. eget + sommarstugan). Aktivt hushåll sparas i context.
- **Profiler utan konto** — Skapa lokala profiler för barn/personer utan Clerk-konto. Kan tilldelas sysslor och chorer utan att logga in.
