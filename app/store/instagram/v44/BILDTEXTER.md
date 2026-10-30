# Instagram vecka 44 (26 oktober – 1 november 2026)

Bilderna är 1080 × 1350 (4:5 – högsta formatet Instagram tar emot i flödet) och byggs med `node app/store/instagram/v44/source/gen.mjs`
(Chrome headless; recepten står i `RECIPES` i samma fil).

## Mån 26/10 – Veckans middagar är redan klara
Mapp: `1-veckans-recept/` (9 bilder, ny stil: omslag, veckomenyn mån–fre, "Så gör du", ett recept per vardag i egen färg, avslutning). Byggs med `source/veckomeny.mjs`, recepten i `source/recipes.mjs`.

Recepten står i sin helhet både på bilderna och i bildtexten. Skärmbild →
"Fota eller välj bild" fungerar för alla fem. Dela-tipset är borttaget: länkimporten
tar bara det FÖRSTA receptet (se backloggen).

Bildtext (håll under 2 200 tecken – Instagrams gräns):

> Veckans middagar är redan klara 🍽️ Fem enkla vardagsrätter – från sticky kyckling till fredagens ugnsnachos.
> Spara dem i Handlis: ta en skärmbild och välj "Fota eller välj bild". Lägg dem på veckomenyn, så hamnar ingredienserna på inköpslistan.
>
> MÅNDAG – Sticky sojakyckling (25 min, 4 port)
> 600 g kycklinglårfilé, 1 msk olja, 3 msk japansk soja, 2 msk honung, 2 vitlöksklyftor, 1 msk riven ingefära, 3 dl jasminris, 250 g broccoli, 2 salladslökar, 1 msk sesamfrön.
> Koka ris och broccoli. Stek kycklingbitarna gyllene. Häll på soja, honung, vitlök och ingefära och koka ihop till en blank glaze, ca 3 min. Toppa med salladslök och sesam.
>
> TISDAG – Halloumi på plåt med sötpotatis (35 min, 4 port)
> 800 g sötpotatis, 1 röd paprika, 1 rödlök, 2 msk olivolja, 1 tsk paprikapulver, salt och peppar, 400 g halloumi, 2 dl turkisk yoghurt, ½ gurka, 1 vitlöksklyfta.
> Ugnen på 225 °C. Rosta sötpotatis, paprika och lök med olja och kryddor i 20 min. Lägg på skivad halloumi och rosta 10 min till. Rör riven gurka och vitlök i yoghurten.
>
> ONSDAG – Laxpasta med citron och spenat (20 min, 4 port)
> 400 g pasta, 400 g laxfilé, 1 vitlöksklyfta, 1 msk smör, 2,5 dl matlagningsgrädde, 1 citron, 65 g babyspenat, salt och peppar, riven parmesan.
> Koka pastan. Stek laxbitarna i smör med vitlök. Häll på grädde, citronskal och -saft, rör ner spenaten. Vänd ner pastan, toppa med parmesan.
>
> TORSDAG – Chili sin carne (30 min, 4 port)
> 1 gul lök, 2 vitlöksklyftor, 1 röd paprika, 1 msk olja, 1 msk chilipulver, 1 tsk spiskummin, 400 g krossade tomater, 2 burkar bönmix à 380 g, 1 tsk salt, 3 dl ris, gräddfil.
> Koka riset. Fräs grönsakerna med kryddorna, häll i tomater och sköljda bönor och puttra 15 min. Servera med gräddfil.
>
> FREDAG – Ugnsnachos (25 min, 4 port)
> 400 g nötfärs, 1 påse tacokrydda, 1 dl vatten, 200 g tortillachips, 1 burk tacosås, 150 g riven ost, 2 tomater, 1 avokado, 2 dl gräddfil.
> Ugnen på 225 °C. Bryn färsen med kryddan och vattnet. Lägg chips, färs, tacosås och ost i en form och gratinera 8–10 min. Toppa med tomat, avokado och gräddfil.
>
> Gör vardagen enkel – med Handlis 💚 Länk i bion.
>
> #veckomeny #vardagsmat #middagstips #snabbmat #barnfamilj #handlis

---

## Ons 28/10 – Tips: Hinner inte handla?
Mapp: `2-skriv-vad-du-ar-sugen-pa/` (5 bilder: omslag, steg 1 skriv, steg 2 Handlis svar med ingredienser och instruktioner, idéer, avslutning).

Prompten och svaret på bild 2–3 är RIKTIGA (instruktionerna lätt redigerade: rotsakerna, basilikan) (skärmbilder 2026-10-22: "Tomatgryta med potatis …"). Kontrollera i appen: hela titeln (skärmbilden kapade den) och början på steg 2 ("Hetta upp oljan i en …" är gissat – bara slutet syntes). Ändras något: `PROMPT`/`ANSWER` i `gen.mjs`.

> Klockan blev för mycket och ingen hinner handla? 😩
> Skriv bara vad du har hemma i Handlis, så skriver Handlis ett recept åt dig – med mängder och instruktioner. Vi testade: "Gör ett recept för 4 personer på 3 potatisar, 2 morötter, vitlök, basilika, krossade tomater, 1 dl grädde och ris" → en krämig tomatgryta med potatis 🍅
>
> Recept → + → Klistra in länk eller recept → skriv → "Tolka och skapa recept". Du kan ändra allt innan du sparar. Funkar lika bra med ett sug: "frasiga våfflor" 🧇
>
> Vad skulle du skriva först? 👇 Länk i bion.
>
> #middagstips #restmat #matsvinn #vardagsmat #skafferiet #hemmalagat #veckomeny #handlis

---

## Sön 25/10 (eller nästa söndag) – Dags att storhandla!
Mapp: `3-sondag-storhandla/` (4 bilder, ny stil: handskrivna rubriker + stämpeln "Handla en gång ✓"). Byggs med `source/sondag.mjs`.

> Söndag = storhandling? 🛒
> Fyra snabba koll innan du går: bestäm veckans middagar, kolla kyl, frys och skafferi, fråga hushållet vad som saknas – och skriv listan i butikens ordning.
> I Handlis blir veckomenyn en inköpslista med ett tryck, sorterad efter din butik, och hela hushållet lägger till i samma lista.
>
> Vad glömmer du oftast? 👇 Länk i bion.
>
> #storhandla #veckohandling #inköpslista #veckomeny #söndag #planering #handlis

---

## Tis 27/10 – Reel: Vilken dag brukar du storhandla?
Filer: `4-reel-vilken-dag.mp4` (med melodin från `aterkommande/source/music.mjs`), `4-reel-vilken-dag-tyst.mp4` (välj ett populärt ljud i Instagram), omslag `4-reel-vilken-dag-omslag.jpg`. 13 s, 1080×1920. Kort och gjord för kommentarer – svara på varenda en.

> Vilken dag brukar du storhandla? 🛒 Skriv din dag i kommentarerna 👇
> (Vi gissar på söndag.)
>
> #storhandla #veckohandling #inköpslista #veckomeny #handlis

---

## Reel: Dela till Handlis (tips #1)
Filer: `5-reel-dela-till-handlis.mp4` (melodi), `-tyst.mp4` (välj populärt ljud), omslag `5-reel-dela-till-handlis-omslag.jpg`. 34,1 s, 1080×1920. Byggs med `source/dela-reel.mjs` ur råklippet `5-dela-till-handlis-ra.mp4` (statusrad bort, kontaktraderna i delningsarken bortklippta så att arken blir kortare (inlägget bakom fylls i från bildrutan före, nedtonat), arkens glidanimationer och väntan bortklippta). Trycken är animerade i efterhand – positioner och tider står i `TAPS`.

> Hittat en veckomeny på Instagram? 🛒
> Tryck på dela → välj Handlis → klart. Alla recepten hamnar i Handlis, och sparar du dem som veckomall ligger de på rätt dagar – med inköpslistan ett tryck bort.
>
> Prova med vår veckomeny i flödet 👇 Länk i bion.
>
> #veckomeny #recept #middagstips #storhandla #inköpslista #handlis

---

## Lör 31/10 – Sugen på nachos?
Mapp: `6-nachos-dela/` (3 bilder: omslag med foto, receptet, avslutning). Omslaget byggs med `source/fredag.mjs`.

> Vad blir det till helgmyset? 🧀
> Nachos direkt ur ugnsformen – klart på 25 minuter. Tryck Dela och välj Handlis, så ligger receptet i appen 💚
>
> 400 g nötfärs, 1 påse tacokrydda, 1 dl vatten, 200 g tortillachips, 1 burk tacosås, 150 g riven ost, 2 tomater, 1 avokado, 2 dl gräddfil.
>
> Sätt ugnen på 225 °C. Bryn färsen med kryddan och vattnet. Lägg chips, färs, tacosås och ost i en form och gratinera 8–10 min. Toppa med tomat, avokado och gräddfil.
>
> #helgmys #nachos #helgmat #middagstips #tacos #handlis
