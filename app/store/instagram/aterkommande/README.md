# Återkommande Instagram-material

Inlägg utan datum eller veckonummer, som kan postas igen och fungerar som
höjdpunkter på profilen.

- `reel-sondag.mp4`: söndagsreelen (27,9 s) **med egen melodi**: plockad
  ukulele, klockspel och små pop vid scenbytena, helt syntetiserad
  (`source/music.mjs`) och fri att använda. "Söndag.." → "…men vänta! Alla
  favoritrecept finns ju i Handlis" → veckomenyn → listan i butikens ordning →
  "Handla en gång – med Handlis 💚" → "Planera veckan i Handlis idag".
- `reel-sondag-tyst.mp4`: samma reel utan ljud, för att i stället välja ett
  populärt ljud ur Instagrams bibliotek (ger ofta mer räckvidd). Sök t.ex. på
  "ukulele", "happy" eller "cooking" i Instagrams ljudval.
- `reel-omslag.jpg`: omslagsbild till reelen (reelens första bildruta är tom, eftersom allt tonar in). Välj den som omslag vid uppladdning, eller i efterhand: reelen → ⋯ → Redigera → Redigera omslag → Lägg till från kamerarullen. Det viktiga ligger i mitten, eftersom profilrutnätet visar reels beskurna till 3:4.
- `story-lank.png`: storybild efter reelen. Lägg ett länkklistermärke till
  `https://handlis.app` under "Tryck här ↓". Spara i höjdpunkten "Kom igång".

Bildtext och publiceringstips finns i `../v43/BILDTEXTER.md`. Källor i `source/`.
Bio och manus för filmade reels finns i `../PROFIL-OCH-REELS.md`.

## Fler reels (samma längd och melodi, 27,9 s)

Byggda ur söndagsreelens mall med `source/variants.mjs`. Varje reel finns med
melodi, utan ljud (`-tyst`) och med omslagsbild (`-omslag.jpg`).

### `reel-gradde.mp4`: "Glömt grädden.. igen 🙃"
"Glömt grädden.. igen" → "Dela listan! Alla i hushållet ser samma
inköpslista" → "Någon lägger till grädde – syns direkt hos dig" → "Tryck
'Jag handlar' – så vet alla var du är" → "Inget glömt – med Handlis 💚" →
"Handla tillsammans i Handlis".

> Glömt grädden. Igen. 🙃
> Med en delad lista i Handlis ser alla i hushållet samma inköpslista – och lägger någon till något medan du står i butiken syns det direkt hos dig. Tryck "Jag handlar" så vet de andra att du är där 🏃
>
> Vem i ert hushåll glömmer oftast något? 👇 Länk i bion.
>
> #inköpslista #delalistan #storhandla #veckohandling #barnfamilj #familjeliv #småbarnsliv #handlis

### `reel-kokboken.mp4`: "Mormors receptbok.."
"Mormors receptbok.. som aldrig finns där när man behöver den" → "Fota
sidan! Handlis läser receptet åt dig" → "Ingredienser och steg – på sekunder"
→ "Lägg det på veckomenyn – listan gör sig själv" → "Mormors pannkakor –
alltid med 💚" → "Rädda era favoritrecept i Handlis".

> Mormors receptbok – med fettfläckarna och handstilen ingen annan kan läsa 📖
> Fota sidan, så läser Handlis ut ingredienser och steg åt dig. Sedan är receptet förevigat i er digitala receptsamling – sökbart, delat med hela familjen och alltid med i mobilen. Och när ni vill laga det hamnar ingredienserna på inköpslistan med ett tryck.
>
> Vilket recept skulle du rädda först? 👇 Länk i bion.
>
> #recept #mormorsrecept #kokbok #receptbok #matlagning #hemmalagat #veckomeny #handlis

**Tips:** posta en reel i veckan, gärna söndag–måndag kväll, och dela den
till storyn med `story-lank.png` efter (se ovan).

## Kvalitet – så blir reels skarpa

Suddiga reels och bilder ger fel signal. Det mesta av skärpan tappas i tre led:

1. **Källbilderna.** Ta skärmbilder direkt på telefonen och för över via USB/mejl som original – aldrig via WhatsApp (skalar ned och komprimerar). Uppskalade bilder blir aldrig skarpa igen.
2. **Vår kodning.** Bildrutor som PNG (`source/reel.mjs`), sedan:
   `ffmpeg -framerate 30 -i ram/%04d.png -c:v libx264 -preset slow -crf 14 -profile:v high -pix_fmt yuv420p -maxrate 12M -bufsize 24M -movflags +faststart ut.mp4`
   och för ljudversionen `-i music.wav -c:a aac -b:a 192k -shortest`. 1080 × 1920, 30 fps.
3. **Instagram.** Slå på *Inställningar → Dataanvändning och mediekvalitet → Ladda upp i högsta kvalitet* och ladda upp via wifi. En reel som delas till storyn visas som ett mindre kort och komprimeras igen – den blir alltid lite mjukare där än i reelflödet.

Design: fet text (Outfit 700) i minst ~36 px (av 540 px bredd i mallen) tål omkomprimeringen; tunn och liten text på mörkgrön bakgrund blir grötig först.
