# Veckis — Backlog

## UI-förbättringar/buggar

### Generellt
- [x] Kunna ha appen i horisontalläge i tablet-format (tablet-format supporteras, portrait-first på phone)
- [x] Skärmen borde hoppa upp när man ska skriva in något så man ser vad man skriver
- [x] Snyggt om man kan hålla inne på inköpslistor/aktiviteter/sysslor/meny så att de skakar om man vill redigera dem och att det kommer upp en delete (x) /redigeringsknapp (penna)
- [x] Emoji bakom hushållsnamnet saknas i inköps- och meny-fliken
- [ ] Större font och knappar/pilar mm i tablet-vyn
- [ ] en AI-agent som tränar på att identifiera basvaror, vad som är måttenhet och rätt kategori
- [ ] Texten hoppar inte upp ovan tangentbordet för Lägga till lokala profiler, nya inköpslistor och butiker
- [ ] Om flera inputfält i samma form borde det finnas en "nästa" i tangentbordet
- [ ] Toast för fler händelser: "Inköpslista rensad", "Hushåll borttaget", "Syssla sparad" m.fl.

### Inställningar
- [x] kunna ta bort hushåll (som admin)
- [x] Admin-funktioner (redigera/ta bort hushåll och användare) visas i en dedikerad "Administrera hushåll"-sektion som bara syns för admins — ingen toggle, sektionen är alltid kollapsad/tydligt avskild
- [x] Admin-badge vid profilnamnet i inställningar så det är tydligt vilka rättigheter man har
- [ ] Lokala users ses som samma och delar uppgifter och markeras ihop. Måste ses som individuella profiler.

### Inköpslistan
- [x] Kunna redigera butiker direkt från inköpsfliken, både butikens namn och redigera, lägga till och ta bort kategorier. Gör den som "recept"-knappen i meny-fliken
- [x] När man lägger till en inköpslista borde man kunna välja butik direkt -> skapa butik om den inte finns
- [x] Även kunna redigera namnet på ingrediensen när man long pressar
- [x] Byt punkt mot komma i ingredienser (1.5 tsk -> 1,5 tsk)
- [x] Gemener när man skriver in Ingredienser mm. Även basvaror bör vara med gemener
- [x] kunna skapa en inköpslista när man trycker att man vill överföra till inköpslista och det inte finns någon.
- [x] byta arkivera mot rensa inköpslista när man är klar
- [x] Sortera ingredienser inom kategori i bokstavsordning
- [x] när man skriver in ingredienser, enhet och mått borde standard vara gemener i inputfältet
- [x] Möjlighet att rensa inköpslista när man är klar istället för att arkivera den
- [ ] Slå ihop ingredienser även om de har olika mått (2 dl + 1,5 msk osv) och namn (mjölk <=> standardmjölk osv)
- [ ] Hitta normaliserade ingrediensnamn och på så vis kunna slå ihop "klyftor vitlök" med "vitlök" och "standardmjölk" med "mjölk" i inköpslistan
- [ ] Om man vill lägga till egen basvara borde den även lägga till varan i databasen om den inte redan finns (förutsatt att man lägger till en kategori)
- [x] Ge någon typ av feedback när en basvara lagts till. Kanske en liten toast!
- [x] Toast bör visa varans namn ("havregryn sparad som basvara"), ha grön bakgrund och sitta ovanför sökrutan utan att krocka med tangentbordet
- [x] Innan basvara läggs till bör man även ange mängd +/- och förbestämd enhet med möjlighet att ändra
- [x] Tar man bort maträtt från inköpslista tas inte ingredienser bort som även delas med andra recept (Ex: 4 ägg i inköpslistan ligger kvar om man tar bort pannkakor [3 av 4 äggen])
- [x] Finns dubbletter av en maträtt i samma inköpslista tas bådas ingredienser bort när man tar bort den ena maträtten
- [x] Rensa-knappen borde bara synas om inköpslistan har innehåll
- [ ] rubriken på inköpslistan syns knappt i ovankant
- [x] Basvaror hamnar i annan kategori i inköpslistan än var de väljs ifrån (ex frysta räkor [frysvaror] hamnar i Kött & Fisk)
- [ ] Ersätt "{basvara} sparad som basvara" med "{Basvara} tillagd till inköpslistan"

### Meny
- [x] "+" borde försvinna från en dag som redan har en rätt inlagd
- [x] Knapp för att kunna överföra hela veckomeny till inköpslistan (kryssa ur om det är någon rätt man av någon anledning inte vill överföra)
- [x] Lägg till alla dagar i menyn även om de är tomma så att det är lätt att lägga till rätt
- [x] I menyn räcker det med veckonummer överst då vi har datumen per dag
- [ ] Har man samma rätt två gånger måste man kunna hålla reda på ingredienser som hör till rätt #1 och #2 för att sedan kunna ta bort/lägga till dem i inköpslistan. Gäller även om de ligger i olika veckomenyer.
- [ ] Varna om man försöker flytta en befintlig rätt till en dag som redan har en rätt inlagd
- [ ] Kunna byta namn och redigera recept med long press
- [ ] Kunna ersätta en maträtt i menyn mot en annan med en knapp <->
- [ ] Enklare kunna flytta maträtter mellan dagarna med longpress för att ta tag i och dra.

### Kalendern
- [x] Kunna välja heldag på en aktivitet
- [x] Kunna redigera en aktivitet genom att hålla inne på aktiviteten
- [x] Kunna göra aktiviteter återkommande
- [x] Återkommande sysslor och aktiviteter behöver ha möjlighet att sätta start och slutdatum
- [x] Månadsvy i tablet visar delad layout: kalender vänster + dagdetaljer höger
- [x] Veckans navigering (WeekNav) är gemensam komponent för kalender och meny
- [x] Sysslor ger nu ljuslila färg på dagar i månadsvy
- [ ] Kunna lägga aktiviteter på users
- [ ] Kunna filtrera på user i sysslor och kalendern
- [ ] Kunna trycka på aktiviteter för att se mer info (beskrivning, plats, påminnelse mm)
- [ ] Få upp en datepicker när man trycker på veckonumret istället för att hoppa till dagens datum
- [ ] Flytta in "Idag"-knappen lite mer så att man inte råkar trycka på den av misstag (gäller även i menyn)

### Sysslor
- [x] Hela namnet på user syns fortfarande inte helt ("Joaki" -> "Joakim"). Funkar dock i aktivitet så något är annorlunda där.
- [ ] Kunna redigera sysslor enklare (med en penna till höger)

---

## Backlog (prioriterade features)

### Kalender

- [x] **Månadsvy på tablet** — Visa hela månaden som grid i kalender-fliken när skärmen är tillräckligt bred
- [x] **Redigera/ta bort events** — Tryck på event öppnar edit-modal. Ta bort-knapp. (Maträtt-event bör navigera till Meny, syssla-event till Sysslor)
- [x] **Upprepade events (serier)** — Välj upprepning när man skapar aktivitet: dagligen, varje vecka (med veckodagscheckboxar), månadsvis (dag X eller N:e veckodag), årsvis 
- [x] Möjlighet att ta bort enstaka vs hela serien
- [x] Möjlighet att redigera enstaka tillfälle vs hela serien
- [x] Intervallstepper "var X dag/vecka/månad/år"
- [x] Slutvillkor: upphör aldrig / välj slutdatum
- [x] Start- och slutdatum för återkommande aktiviteter och sysslor

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
