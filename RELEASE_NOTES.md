# Handlis 2.1.0 — release notes

Släppet efter 2.0.0 handlar mindre om utseende och mer om att appen ska bete
sig förutsägbart. Tyngdpunkten ligger på ingrediensdatan — varor som bytte
kategori av sig själva, engelska namn och mått som följde med från importerade
recept — och på en lång rad fel som kommit rakt ur testarnas feedback.

## Play Store — kort "Vad är nytt" (klistra in i Play Console)

> **Varor stannar där du lagt dem.** Kategorierna är nu kurerade, så
> ingredienser slutar hoppa till "Övrigt" av sig själva. Engelska recept
> översätts vid import, och mått visas i svenska köksmått (1¾ dl i stället
> för 1,75). Receptbilden går att dra till rätt utsnitt. Dessutom mörkt läge
> i hela den nya designen, landskapsläge, och fixar för tangentbord som
> täckte fält, notiser på fel plats och listor som hoppade.

*(Under 500 tecken, klar att klistra in. Justera fritt.)*

---

## 1. Ingredienser och kategorier

Det här var den största källan till irritation i 2.0.0: varor som avokado,
bacon och bröd kunde plötsligt ligga under "Övrigt", och namn som "400g ost"
eller halva recepttexter hamnade i den gemensamma ingredienslistan.

- **Kategorierna är kurerade i stället för inlärda.** Appen slutade dra
  slutsatser av vad enskilda hushåll gör. En vara byter inte kategori för
  att någon annan flyttat sin.
- **Skräp kommer inte in i den gemensamma listan.** Ett varunamn får inte
  börja med en siffra, innehålla mängder eller enheter, eller vara ett val
  mellan alternativ.
- **"Nötfärs alt. sojafärs" blir två varor**, inte en sträng. De är inte
  samma vara och ska inte läras in som det.
- **Engelska recept översätts vid import.** Originalnamnet sparas, och
  ↔-knappen i receptet växlar namn och enhet tillsammans.
- **Enheter blir svenska.** En basvara som skapats ur ett engelskt recept
  kunde ärva "teaspoon" och behålla den för all framtid.
- Namn visas i rätt form — "2 äpplen" i stället för "2 äpple", "2 flaskor"
  i stället för "2 flaska".

## 2. Mått i köksform

- **Bråk i stället för decimaler:** 1¾ dl, ⅔ dl, 2½ msk. "4,7 dl" är inget
  man mäter upp.
- Volymmått räknas om till svenska, men **vikt förblir vikt** — 200 grams
  blir 200 g, aldrig omräknat till volym.
- Omräkningen av cups rättad: 2 cups och 1 pint är samma volym och ger nu
  samma svar.

## 3. Recept

- **Receptbilden går att justera.** Dra i bilden i redigeringsläget för att
  välja vilken del som syns. Hela bilden sparas, så utsnittet går att ändra
  om, och det fungerar även för bilder som följt med från en importerad
  webbsida.
- **Laga-läget:** ingredienslistan krymper allt eftersom du bockar av, så
  det som är kvar är det du har kvar att göra.
- Mängder tappade sina kvartar — 1,75 visades som 2.

## 4. Utseende och skärmlägen

- **Mörkt läge för den nya designen** ("djup skog").
- **Landskapsläge** fanns men gick inte att nå.
- Aviseringar (toasts) har rätt färg för temat och lägger sig inte längre
  ovanpå sökfältet på mobiler med lägre skärm.

## 5. Buggar ur testarnas feedback

- Ark och dialoger som hoppade upp för långt över tangentbordet, eller stod
  kvar lyfta när man växlat ut och in ur appen.
- Medlemslistan i Hushållet hoppade till varje gång fliken öppnades, för att
  en laddningssnurra sköt ner korten en halv sekund.
- Kryssrutornas träffyta i inköpslistan.
- Bulk-överföring av ingredienser stängde inte ordentligt på
  inventeringssteget.
- Inloggning: kodverifiering som misslyckades tyst, och ett andra steg som
  kunde ta slut mitt i.

## 6. Under huven

- **Testerna körs i CI.** De fanns, men ingen körde dem automatiskt — det
  upptäcktes under arbetet med det här släppet.
- Verktyg för att städa ingrediensdatan i drift, med en granskningsfil att
  gå igenom manuellt i stället för automatiska massändringar.
- Adminbehörigheter låsta till en explicit lista, som felar stängt.
- Webb-PWA:ns driftsättning ägs av CI i stället för av en hook som tyst
  slutade fungera.

---

*Sammanställt från commit-historiken sedan senaste Play-släppet
(versionCode 11, v2.0.0) fram till versionCode 12 (v2.1.0).*
