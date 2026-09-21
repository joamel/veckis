/**
 * Hittar varianter av samma varunamn: felstavningar, ihopskrivningar och
 * omkastningar. "koncentrierad kycklingfond", "konzentrierad kycklingfond" och
 * "kycklingfond, koncentrerad" är samma vara skriven på tre sätt.
 *
 * Två spår, eftersom felen är av olika slag:
 *   1. Normalisering — skiljetecken, ordföljd och diakriter bort. Fångar
 *      omkastningar och ihopskrivningar exakt, utan gissning.
 *   2. Redigeringsavstånd — för stavfel, med ett tak som växer med längden så
 *      korta ord inte klumpas ihop ("lök" och "lok" ska inte slås samman).
 */

/** Gemener, utan skiljetecken, ord sorterade. "kycklingfond, koncentrerad"
 *  och "koncentrerad kycklingfond" ger samma nyckel. */
export function normalisera(namn: string): string {
  return namn
    .toLowerCase()
    .replace(/[^a-zåäöéèüïî0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');
}

/**
 * Utan mellanslag, i ORIGINALETS ordning — fångar ihopskrivningar som
 * "vitlöksklyftorfinhackade" mot "vitlöksklyftor finhackade".
 *
 * Här får orden INTE sorteras: den hopskrivna formen är ett enda ord och kan
 * inte sorteras om, så en sorterad motpart matchar aldrig. Omkastad ordföljd
 * fångas av normalisera i stället.
 */
export function utanMellanslag(namn: string): string {
  return namn
    .toLowerCase()
    .replace(/[^a-zåäöéèüïî0-9]/g, '');
}

/** Levenshtein-avstånd. Itterativt med en rad, eftersom listorna kan bli långa. */
export function avstånd(a: string, b: string): number {
  if (a === b) return 0;
  const rad = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let föregående = rad[0];
    rad[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = rad[j];
      rad[j] = Math.min(
        rad[j] + 1,
        rad[j - 1] + 1,
        föregående + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      föregående = temp;
    }
  }
  return rad[b.length];
}

/**
 * Är de två namnen samma vara?
 *
 * Taket växer med längden: ett tecken fel i ett kort ord är ofta en annan vara
 * ("lök"/"lok", "ris"/"ris"), medan tre tecken i ett långt sammansatt ord
 * nästan alltid är ett stavfel ("koncentrierad"/"konzentrierad").
 */
/**
 * Är det ena namnet pluralformen av det andra? "vårlök"/"vårlökar",
 * "tomat"/"tomater", "äpple"/"äpplen".
 *
 * Ordförrådet ska vara singular — visningen pluraliserar själv när antalet är
 * fler än ett. Två rader för samma vara splittrar dessutom kategori-inlärning
 * och sökförslag i onödan.
 *
 * Bara de vanliga ändelserna, och bara när stammen är identisk. Omljud
 * (morot/morötter) fångas inte här utan av SINGULAR_FORMS i stripIngredient.
 */
export function ärPluralform(a: string, b: string): boolean {
  const [kort, lång] = a.length <= b.length ? [a, b] : [b, a];
  const k = kort.toLowerCase().trim();
  const l = lång.toLowerCase().trim();
  if (k === l) return false;
  return ['ar', 'er', 'or', 'n', 'na', 'r'].some(ändelse => k + ändelse === l);
}

export function ärSammaVara(a: string, b: string): boolean {
  const na = normalisera(a);
  const nb = normalisera(b);
  if (na === nb) return true;
  if (utanMellanslag(a) === utanMellanslag(b)) return true;
  if (ärPluralform(na, nb)) return true;

  const längd = Math.min(na.length, nb.length);
  if (längd < 6) return false; // för kort för att gissa
  const tak = längd < 10 ? 1 : längd < 16 ? 2 : 3;
  return avstånd(na, nb) <= tak;
}
