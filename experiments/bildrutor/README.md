# Experiment: hittar modellen var recepten sitter på bilden?

**Frågan som ska besvaras:** om ett kokboksuppslag innehåller flera recept — kan
modellen returnera koordinater som är tillräckligt exakta för att rita ut som
rutor ovanpå bilden?

Det avgör om idén med färgade rutor man kan dra i är byggbar. Landar rutorna
rätt är resten hantverk. Landar de fel är funktionen sämre än ingen funktion: en
visuell bekräftelse som inte går att lita på är värre än ingen bekräftelse.

Claude har inget detektionshuvud — koordinater är ett känt svagt område. Därför
mäter vi innan vi bygger UI.

## Kör

```powershell
# Lägg bilden i experiments/bildrutor/bilder/ — filnamnet räcker sedan.
$env:ANTHROPIC_API_KEY = "sk-ant-..."
npm run bildrutor -- uppslag.jpg
```

Flaggor:

- `--model <id>` — default är samma modell som appen kör (`claude-haiku-4-5`).
  Kör om med `--model claude-opus-5` för att se om en starkare modell är
  märkbart bättre på koordinater; det avgör om funktionen är värd sin kostnad.
- `--out <fil>` — var HTML-resultatet hamnar (default bredvid bilden).

Resultatet blir en HTML-fil som öppnas i webbläsaren: originalbilden med
utritade rutor, en färg per recept, plus modellens rådata. Ingen bildbehandling
behövs — rutorna är absolutpositionerade div:ar i procent.

## Kända resultat

- **claude-haiku-4-5** — rutan omslöt ingredienserna men inte tillagningen.
- **claude-opus-5** — hittade både ingredienser och tillagning, men kapade rutorna delvis.
  Båda rutorna fick identisk bredd och vänsterkant (x=519, w=316), vilket kan vara korrekt
  för recept staplade i samma spalt — eller ett tecken på att modellen normaliserar.

**Slutsats så här långt:** koordinaterna är ungefärliga, inte exakta. Det ger designregeln
att rutorna får PEKA men aldrig BESTÄMMA — klipper man ut en ruta och tolkar om den blir
kapningen en dataförlust, medan den som visuell ledtråd bara är ett skönhetsfel.

Det som återstår att mäta är därför inte geometrin utan tilldelningen: hamnar rätt
ingredienser hos rätt recept?

## Vad du ska titta efter

1. **Antalet recept** — stämmer det med vad du ser?
2. **Rutornas placering** — täcker varje ruta rätt recept, eller glider de?
3. **Skillnad mellan modeller** — är den dyrare modellen tillräckligt mycket
   bättre för att motivera kostnaden per foto?

Duger koordinaterna inte: idén läggs ner, och verifieringen får ske genom att
källfotot sparas på receptet i stället.
