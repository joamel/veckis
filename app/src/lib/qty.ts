/**
 * Skalar en ingrediensmängd efter portionsantal och snäpper resultatet till
 * något man faktiskt kan mäta upp.
 *
 * Två regler, båda inlärda av en bugg:
 *
 * 1. Vid OSKALAD visning (ratio 1) rundas ingenting. Avrundningen finns för
 *    att en skalning inte ska ge "1,3333 dl" — den har ingenting att göra med
 *    ett recept som visas som det importerades. Tidigare kördes den ändå, och
 *    "1 3/4 cup" ur ett importerat recept visades som "2 cup". Källan och
 *    parsern var korrekta hela vägen; värdet tappades i sista steget.
 *
 * 2. Skalade mängder snäpps till KVARTAR oavsett storlek. Tidigare gällde
 *    kvartar bara under 1 och halvor däröver, vilket är för trubbigt så fort
 *    amerikanska mått är inblandade: 1,75 → 2, 1,25 → 1,5.
 */
export function skalaQty(quantity: number, scaleRatio = 1): number {
  const n = quantity * scaleRatio;
  if (scaleRatio === 1) return n;
  if (n % 1 === 0) return n;
  return Math.round(n * 4) / 4;
}

// Normaliserar mängd-inmatning i alla qty-fält: "." → "," (svensk decimal),
// lägger en ledande "0" om man börjar med "," (→ "0,"), och tillåter bara
// siffror + ett enda kommatecken.
export function normalizeQtyInput(t: string): string {
  let txt = t.replace('.', ',').replace(/[^0-9,]/g, '');
  if (txt.startsWith(',')) txt = '0' + txt;
  const i = txt.indexOf(',');
  if (i !== -1) txt = txt.slice(0, i + 1) + txt.slice(i + 1).replace(/,/g, '');
  return txt;
}
