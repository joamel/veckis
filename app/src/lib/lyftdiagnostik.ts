/**
 * Senaste tangentbordslyftet, i klartext.
 *
 * Finns för att lyftbuggarna bara går att se på en riktig telefon, och de
 * siffror som avgör allt — tangentbordets rapporterade höjd, fönsterhöjden och
 * fältets uppmätta läge — aldrig syns någonstans. Utan dem blir varje rättning
 * en gissning. Raden visas i Inställningar, under versionsraden.
 *
 * Bara det senaste värdet sparas, i minnet. Ingenting skickas någonstans.
 */

export type Lyftspår = {
  /** Tangentbordets höjd som keyboardDidShow rapporterade den. */
  kbHöjd: number;
  /** Fönsterhöjd enligt useWindowDimensions. */
  windowHeight: number;
  /** Fältets uppmätta y och höjd. */
  y: number;
  h: number;
  /** Lyftet som var renderat när mätningen gjordes. */
  renderatLyft: number;
  /** Lyftet mätningen resulterade i. */
  lyft: number;
  /** Var mätningen kom ifrån, t.ex. "ark" eller "recept". */
  källa: string;
};

let senaste: Lyftspår | null = null;

export function sparaLyftspår(spår: Lyftspår): void {
  senaste = spår;
}

export function senasteLyftspår(): Lyftspår | null {
  return senaste;
}

/**
 * En rad som får plats under versionsraden. Tangentbordets andel av skärmen
 * är det intressanta talet: är den långt från ~0,35–0,45 är höjden fel
 * rapporterad, och då blir lyftet fel oavsett hur rätt uträkningen är.
 */
export function formateraLyftspår(spår: Lyftspår | null): string | null {
  if (!spår) return null;
  const andel = spår.windowHeight > 0 ? spår.kbHöjd / spår.windowHeight : 0;
  return [
    `${spår.källa}: kb ${Math.round(spår.kbHöjd)}/${Math.round(spår.windowHeight)}`,
    `(${andel.toFixed(2)})`,
    `fält ${Math.round(spår.y)}+${Math.round(spår.h)}`,
    `lyft ${Math.round(spår.renderatLyft)}→${Math.round(spår.lyft)}`,
  ].join(' ');
}
