# Handlis — Backlog efter lansering

Färsk feedback insamlad efter (beta)lanseringen. Håll den här ren och kort — det
gamla, mestadels avklarade, ligger kvar i `BACKLOG.md` (arkivet). Avklarat flyttas
till `[x]` här och arkiveras vid tillfälle.

## Generellt
- [ ] "x" i inputfält för att snabbt radera text — i alla textfält (sök, lägg-till-vara, receptfält). **Ej** i lösenordsfält.

## Inköpslistan
- [ ] Döp om "sub-kategorier" → **"underkategorier"** genomgående i UI.
- [ ] Kunna **sortera underkategorier utan att behöva visa dem** — idag går sub-sortering bara när man bockat i/visar en sub.
- [ ] Kunna **ta bort felaktiga varor** i inköpslistan: håll inne på sökresultatet → "ta bort" som alternativ i redigeringsläget. Följ appens ångra-toast-mönster för destruktivt.
- [ ] 🐛 Avmarkerade varor som slagits ihop i klart-högen **föreslås felaktigt som dubbletter** — dubblett-detektorn bör exkludera redan klarmarkerade/hopslagna grupper.
- [ ] **Auto-sidoscrolla** till vald kategori och underkategori när man redigerar/lägger till ny vara (scroll-into-view).
- [ ] Kunna **dra runt kategorier via de grå horisontella strecken** i stället för pilarna.

## Meny
- [ ] Kunna **överföra flera veckor samtidigt** till inköpslistan — slå ihop samma ingrediens över veckor till en rad + visa en tydlig sammanfattning av vad som förs över.

## Recept
- [ ] 🐛 **Receptbilden flimrar fortfarande i PWA** — memoiserings-fixen (BACKLOG.md-arkivet) räckte inte; återkommer inne i receptet.
- [ ] Kunna **skapa ny inköpslista direkt** när man lägger till från ett recept (samma som veckomeny-överföringen redan föreslår ny lista om ingen finns).
- [ ] Laga-läget: **"steget" ska poppa upp så långt underifrån som möjligt** så man slipper skrolla när det inte behövs.
- [ ] Vid scroll i receptlistan: **fäll ihop sök + taggar** så de tar mindre plats (pil/knapp för att fälla ut igen).
- [ ] 🐛 Nytt recept: **"lägg till"-knappen lyfts inte tillräckligt** över tangentbordet (PWA + native).
- [ ] 🐛 Redigera vara (recept): **mängd/enhet lyfts inte tillräckligt** vid fokus, och **enhetsvalen syns inte alls** när man klickar i enhetsfältet.
- [ ] 🐛 **Ny butik-modalen går inte att stänga genom att klicka utanför** (PWA).
