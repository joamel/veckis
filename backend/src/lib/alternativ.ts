/**
 * Delar ett ingrediensnamn med alternativ i de varor det faktiskt handlar om.
 *
 *   "nötfärs alt. vegofärs"                    → ["nötfärs", "vegofärs"]
 *   "vego- bland- eller hushållsfärs"          → ["vegofärs", "blandfärs", "hushållsfärs"]
 *   "körsbärstomater eller romanticatomater"   → båda
 *
 * Används BARA för att lära in ordförrådet — den globala poolen och hushållets
 * basvaror. Varans namn i inköpslistan rörs aldrig: där ska alternativet stå
 * kvar, eftersom valet mellan nötfärs och vegofärs tillhör den som handlar.
 * (Ett försök att klippa bort alternativ i strippningen backades av just det
 * skälet 2026-09-20.)
 */

const KOPPLINGAR = /\s+(?:eller|alt\.?|alternativt)\s+/i;

/**
 * Efterled som svenska drar ihop när alternativ räknas upp: "vego- bland-
 * eller hushållsfärs" betyder vegoFÄRS, blandFÄRS, hushållsfärs. Bindestrecket
 * står för efterledet i det SISTA alternativet, men vilket det är går inte att
 * räkna ut ur ordet — "hushållsfärs" kan i princip delas var som helst. Därför
 * en lista över de efterled som faktiskt förekommer i mat.
 */
const EFTERLED = [
  'färs', 'dryck', 'mjölk', 'grädde', 'olja', 'mjöl', 'ost', 'korv', 'filé',
  'bröd', 'sås', 'pasta', 'ris', 'bönor', 'yoghurt', 'fil', 'smör', 'sylt',
];

/** Efterledet i sista alternativet, om det är ett vi känner igen. */
function efterled(sista: string): string | null {
  const ord = sista.trim().toLowerCase();
  // Längsta träff först, så "mjölk" vinner över "mjöl" i "havremjölk".
  return [...EFTERLED].sort((a, b) => b.length - a.length).find(e => ord.endsWith(e) && ord.length > e.length) ?? null;
}

export function delaAlternativ(namn: string): string[] {
  // Komma fungerar som uppräkning precis som kopplingsorden: "vego-, bland-
  // eller hushållsfärs". Enklast att göra dem till mellanslag direkt.
  const delar = namn.replace(/,/g, ' ').split(KOPPLINGAR).map(d => d.trim()).filter(Boolean);
  if (delar.length < 2) return [namn.trim()].filter(Boolean);

  // Ett led kan i sin tur innehålla flera hopdragna alternativ: "vego- bland-"
  // är två, inte ett. Varje ord som slutar på bindestreck bryts ut för sig,
  // och resten av ledet hålls ihop ("rökt skinka" får inte delas).
  const grenar: string[] = [];
  for (const del of delar) {
    const ord = del.split(/\s+/);
    const svans: string[] = [];
    for (const o of ord) {
      if (o.endsWith('-')) grenar.push(o);
      else svans.push(o);
    }
    if (svans.length > 0) grenar.push(svans.join(' '));
  }

  const huvud = efterled(grenar[grenar.length - 1] ?? '');

  const ut: string[] = [];
  for (const gren of grenar) {
    if (!gren.endsWith('-')) { ut.push(gren); continue; }
    // "vego-" utan känt efterled går inte att rekonstruera — hellre hoppa över
    // den än att lära in ett halvt ord som vara.
    if (huvud) ut.push(gren.slice(0, -1) + huvud);
  }

  return [...new Set(ut)];
}
