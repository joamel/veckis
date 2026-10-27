/**
 * Flyttar en underrubrik i receptets redigering så att den står ovanför raden
 * \`to\`. Rubriken är en avdelare, inte en grupp: där den lämnar går raderna
 * tillbaka till gruppen ovanför, och där den hamnar gäller den raderna nedåt
 * fram till nästa rubrik. Så går en rubrik som saknades ("Deg") att lägga till
 * (den hamnar sist) och dra upp ovanför ingredienserna den hör till.
 *
 * Raderna bär sin rubrik i \`section\`; en rubrik syns före första raden i varje
 * följd med samma section.
 */
export function flyttaRubrik<T extends { section: string | null }>(rader: T[], from: number, to: number): T[] {
  const sektion = rader[from]?.section;
  if (sektion === null || sektion === undefined || to < 0 || to >= rader.length || to === from) return rader;
  const next = rader.map(r => ({ ...r }));
  const ovanför = from > 0 ? next[from - 1].section : null;
  for (let i = from; i < next.length && rader[i].section === sektion; i++) next[i].section = ovanför;
  const gruppVid = next[to].section;
  for (let i = to; i < next.length && next[i].section === gruppVid; i++) next[i].section = sektion;
  return next;
}
