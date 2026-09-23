/**
 * Mängder uttryckta i mått man faktiskt har hemma.
 *
 * En konvertering ger exakta tal som "4,7 dl", och den siffran går inte att
 * mäta upp: en svensk måttsats har 1 dl, ½ dl, msk, tsk och krm. Närmaste
 * bråkdel är både begripligare och lika rätt i praktiken — skillnaden mellan
 * 4,7 och 4⅔ dl är tre milliliter.
 *
 * Bara för VISNING. Det lagrade värdet är kvar exakt, så en omräkning aldrig
 * bygger på ett avrundat tal.
 */

/**
 * Bråkdelar man kan mäta upp, med tecknet som visas.
 *
 * ALLA bråk skrivs med snedstreck, inget som ¼ eller ⅔. Appens typsnitt
 * (Outfit) har glyfer för ¼, ½ och ¾ men INTE för tredjedelarna — de föll
 * tillbaka på systemets typsnitt, och "¾" och "⅔" såg ut att komma ur två
 * olika typsnitt i samma kolumn (kontrollerat i fontens cmap).
 *
 * Första försöket skrev bara tredjedelarna med snedstreck. Då blev skillnaden
 * STÖRRE: "1¼ dl" bredvid "2 1/3 dl" i samma kolumn är två olika sätt att
 * skriva ett bråk. Hellre en form som är sig lik hela vägen ned.
 */
const BRÅK: { värde: number; tecken: string }[] = [
  { värde: 0, tecken: '' },
  { värde: 1 / 4, tecken: '1/4' },
  { värde: 1 / 3, tecken: '1/3' },
  { värde: 1 / 2, tecken: '1/2' },
  { värde: 2 / 3, tecken: '2/3' },
  { värde: 3 / 4, tecken: '3/4' },
  { värde: 1, tecken: '' },
];

/** Bråket behöver ett mellanrum mot heltalet: "42/3" går inte att läsa,
 *  "4 2/3" gör det. */
const BEHÖVER_MELLANRUM = (tecken: string) => tecken.includes('/');

/** Enheter som mäts med måttsats och därför mår bra av bråk. Vikt gör det
 *  inte — "250 g" är precis vad vågen visar, och "¼ kg" hjälper ingen. */
const BRÅKENHETER = new Set(['dl', 'l', 'msk', 'tsk', 'krm', 'st', 'klyfta', 'nypa']);

/**
 * "4,7 dl" → "4⅔ dl". Heltal och vikt lämnas som de är.
 *
 * Returnerar bara talet; enheten sätts av anroparen.
 */
export function formateraKöksmått(quantity: number, unit: string | null): string {
  const visaVanligt = () =>
    String(quantity % 1 === 0 ? quantity : quantity.toFixed(2).replace(/\.?0+$/, '').replace('.', ','));

  if (!unit || !BRÅKENHETER.has(unit.toLowerCase())) return visaVanligt();
  if (quantity % 1 === 0) return String(quantity);
  if (quantity < 0) return visaVanligt();

  const heltal = Math.floor(quantity);
  const rest = quantity - heltal;

  let bäst = BRÅK[0];
  for (const b of BRÅK) {
    if (Math.abs(rest - b.värde) < Math.abs(rest - bäst.värde)) bäst = b;
  }

  // Ligger resten närmare ett helt än något bråk räknas den upp.
  if (bäst.värde === 1) return String(heltal + 1);
  if (bäst.värde === 0) return String(heltal === 0 ? visaVanligt() : heltal);

  if (heltal === 0) return bäst.tecken;
  return `${heltal}${BEHÖVER_MELLANRUM(bäst.tecken) ? ' ' : ''}${bäst.tecken}`;
}
