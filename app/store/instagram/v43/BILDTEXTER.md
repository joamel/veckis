# Instagram vecka 43 (19–25 oktober 2026)

Ett reel i dag och fyra karuseller i veckan. Bilderna är 1080 × 1440 (3:4),
reelen 1080 × 1920 och knappt 30 sekunder **utan ljud**. Lägg till ett populärt ljud
i Instagram-appen när du publicerar, det ger mer räckvidd än tystnad.

Lägg in tiderna i förväg med Instagrams schemaläggning ("Avancerade
inställningar → Schemalägg"). Kvällar runt 19–20 brukar fungera bra för
mat och familj.

---

## Sön 18/10 – Reel: "Söndag.." + story med länk
Filer: `0-reel-sondag.mp4` (reel) och `0-story-lank.png` (story)

Reelen (29,5 s, ca 5 s per scen): "Söndag.." (suck 😮‍💨) → "…men vänta! 💡 Alla favoritrecept
finns ju i Handlis" → "Plocka några till veckomenyn – eller ta en sparad vecka,
klart på en minut" → "Listan sorterar sig själv – efter butikens ordning" →
"Handla en gång – med Handlis 💚" → "Planera vecka 43 i Handlis idag".

> Söndag.. och ingen aning om vad vi ska äta i veckan 😮‍💨
> …men vänta, favoriterna finns ju redan i Handlis 💡 Några till veckomenyn (eller en sparad vecka), och inköpslistan sorterar sig själv efter din butik. Handla en gång – sen är det bara att laga 💚
>
> Hur planerar ni veckans mat? Skriv i kommentarerna 👇
>
> #veckomeny #matsedel #veckohandling #storhandla #inköpslista #middagstips #barnfamilj #söndag #handlis

**Story med klickbar länk** (reels kan inte ha länkar, stories kan):
1. Publicera reelen och tryck **Dela → Din story**.
2. Lägg upp `0-story-lank.png` som nästa story.
3. Tryck på klistermärkesikonen → **Länk** → `https://handlis.app` och
   placera klistermärket under "Tryck här ↓".
4. Spara gärna storyn i en höjdpunkt ("Kom igång"), så finns länken kvar på
   profilen efter 24 timmar.

---

## Mån 19/10 – Veckans meny v.43
Mapp: `1-veckans-meny/` (5 bilder)

> Veckans meny, vecka 43 🍝🌮🐟🥣🍕
>
> Mån: Krämig pasta med kyckling och spenat
> Tis: Tacos
> Ons: Ugnslax med potatis och dillsås
> Tor: Röd linssoppa
> Fre: Hemmagjord pizza
>
> Svep för hela inköpslistan, där samma vara från flera recept redan är ihopslagen. Spara inlägget så har du listan med dig i butiken 💚
>
> #veckansmeny #veckomeny #matsedel #middagstips #vardagsmat #barnfamilj #inköpslista #handlis

---

## Ons 21/10 – 7 sätt att slippa åka tillbaka till affären
Mapp: `2-slippa-aka-tillbaka/` (5 bilder)

> Glömt grädden. Igen. 🙃
> Sju enkla vanor som gör att du klarar dig på en tur till affären i veckan. Nummer 3 är den som gör störst skillnad.
>
> Vilken av dem gör du redan? Och vilken saknas på listan?
>
> #storhandla #veckohandling #inköpslista #spara #matbudget #planering #barnfamilj #handlis

---

## Fre 23/10 – Mormors receptbok i mobilen
Mapp: `3-fota-kokboken/` (4 bilder)

> Kokboken med fettfläckarna. Mormors handskrivna lappar. Receptet du fotade hos en vän 📖
> Fota sidan, så läser Handlis ut ingredienser och steg åt dig, även när det är flera sidor eller flera recept på samma uppslag. Sedan ligger det i receptboken som hela hushållet delar.
>
> Vilket recept skulle du rädda först?
>
> #recept #kokbok #mormorsrecept #receptbok #matlagning #hemmalagat #handlis

---

## Sön 25/10 – Planera veckan på 10 minuter
Mapp: `4-planera-pa-10-minuter/` (5 bilder)

> Söndagsrutinen som gör vardagen lättare ☕
> 1. Välj 4–5 middagar
> 2. Lägg dem på dagarna
> 3. Gör inköpslistan och bocka bort det som finns hemma
> 4. Handla en gång
>
> Tio minuter, och "vad ska vi äta?" är löst för hela veckan. Spara till nästa söndag 💚
>
> #veckomeny #matplanering #söndagsrutin #veckohandling #barnfamilj #vardagstips #handlis

---

## Nästa veckas idéer (ur backloggen)
- **Dela till Handlis**, när 2.3.0 är ute i butikerna: "Hittat ett recept på Instagram? Tryck Dela."
- **Snabblistan**: veckans basvaror med ett tryck.
- **Dubbletter slås ihop**: 2 dl + 3 dl grädde blir 5 dl.
- **Hitta din butik**: listan i den ordning du går.

## Bygga om bilderna
Källorna ligger i `source/`. Bilderna ritas som HTML med Outfit och appens
skärmbilder (`app/assets/ios/clean/6.3/`) och fotograferas i en headless-
webbläsare (`browser-automation`-skillen). Reelen renderas bildruta för
bildruta och sätts ihop med ffmpeg. Lägg typsnitten (`app/assets/fonts/Outfit_*.ttf`),
`app/assets/icon.png` och skärmbilderna `02/03/05/07.jpg` bredvid filerna och
justera `DIR` i skripten innan körning.
