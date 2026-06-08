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
