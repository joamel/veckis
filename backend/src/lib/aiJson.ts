/**
 * Tolkning av JSON-svar från Claude. Modellen ombeds returnera ren JSON, men gör
 * det inte alltid: den kan lägga en förklaring före, packa in svaret i ett
 * ```json-block, eller — när bilden inte föreställer det man bad om — svara med
 * ren prosa.
 *
 * Tidigare skalades bara ett kodblock i BÖRJAN av svaret bort, och resultatet
 * skickades rakt in i JSON.parse. Prosa gav då ett rått "Unexpected token ` in
 * JSON at position 108" ända ut till användaren.
 */

/** Kastas när svaret inte innehåller någon JSON alls — typiskt när modellen förklarar i stället. */
export class InteJsonError extends Error {
  constructor(public readonly råtext: string) {
    super('Svaret innehöll ingen JSON');
    this.name = 'InteJsonError';
  }
}

/**
 * Plockar ut och tolkar JSON-objektet ur ett modellsvar.
 *
 * Letar upp yttersta { … } i stället för att lita på att svaret börjar och
 * slutar med objektet — det gör både inledande prosa och kodblock ofarliga,
 * var i svaret de än står.
 */
export function tolkaJsonSvar(rå: string): unknown {
  const text = rå.trim();
  const start = text.indexOf('{');
  const slut = text.lastIndexOf('}');
  if (start < 0 || slut <= start) throw new InteJsonError(text);

  try {
    return JSON.parse(text.slice(start, slut + 1));
  } catch {
    throw new InteJsonError(text);
  }
}

/**
 * Ett svar utan både ingredienser och tillagning är inget recept, även om det är
 * giltig JSON. Utan den här kontrollen skapades ett tomt recept med titeln
 * "Okänt recept" när man fotade något annat än ett recept.
 */
export function saknarReceptinnehåll(parsed: {
  instructions?: unknown;
  ingredients?: unknown;
}): boolean {
  const harIngredienser = Array.isArray(parsed.ingredients)
    && parsed.ingredients.some(i => typeof (i as { name?: unknown })?.name === 'string' && (i as { name: string }).name.trim());
  const harSteg = typeof parsed.instructions === 'string' && parsed.instructions.trim().length > 0;
  return !harIngredienser && !harSteg;
}

/**
 * Plockar ut textsvaret ur ett Claude-svar.
 *
 * `content[0]` är INTE alltid texten: modeller med tänkande påslaget (Opus 5 gör
 * det som standard) lägger ett thinking-block först. Antagandet ger då tom
 * sträng, och felet visar sig som "modellen svarade inte med JSON" — långt från
 * orsaken. Upptäckt i bildrutor-experimentet vid ett modellbyte.
 */
export function textUr(msg: { content: Array<{ type: string; text?: string }> }): string {
  return msg.content.find(b => b.type === 'text')?.text?.trim() ?? '';
}
