import { startsWithUnit } from './stripIngredient';
import { normalizeUnit } from '@veckis/shared';

/**
 * Städar en receptingrediens från två MEKANISKA importfel. Ordalydelsen i
 * övrigt rörs aldrig: "banan, i bitar (ca 150 g skalad vikt)" och "valfri sylt
 * eller färska bär, till servering" är korrekta receptrader och ska stå kvar
 * precis som de står. Receptet är källans text; det är basvaran och den
 * globala poolen som kanoniseras.
 *
 * De två felen:
 *  1. ENHETEN LIGGER KVAR I NAMNET: "g nötfärs alt. vego- ...". Mängden lästes
 *     ut men enheten blev kvar först i namnet, så varan heter "g nötfärs …"
 *     i receptet och i ordförrådet. Enheten flyttas till sitt eget fält.
 *  2. EN RUBRIK HAR KLISTRATS IHOP MED VARAN: "tillbehör: gröna ärtor". Källan
 *     delar in ingredienserna i avsnitt, och avsnittsrubriken följde med in i
 *     första varan.
 */

// Rubriker som förekommer i ingredienslistor. Medvetet kort lista: ett kolon
// i en ingrediensrad kan också vara något annat, och då ska raden lämnas.
const RUBRIK_RE = /^\s*(?:tillbehör|till servering|servering|garnering|garnityr|topping|sås|dressing|marinad|smet|fyllning|botten|dekoration|övrigt|ingredienser|övriga ingredienser)\s*:\s*/iu;

export function stadaIngrediensrad<T extends { name: string; unit?: string | null }>(rad: T): T {
  let name = rad.name.trim();
  let unit = rad.unit ?? null;

  // Rubriken först: "tillbehör: gröna ärtor" → "gröna ärtor".
  const utanRubrik = name.replace(RUBRIK_RE, '').trim();
  if (utanRubrik.length > 0) name = utanRubrik;

  // Enhet först i namnet — bara när enhetsfältet är tomt. Är enheten redan
  // satt är ordet i namnet något annat ("st paprika" med unit "st" vore
  // dubbelt, men "l" i "l'artigiano" ska inte heller röras).
  if (!unit) {
    const m = name.match(/^([a-zåäö]+)\.?\s+(.+)$/iu);
    if (m && startsWithUnit(`${m[1]} x`)) {
      unit = m[1].toLowerCase();
      name = m[2].trim();
    }
  }

  // Samma enhet ska heta samma sak oavsett hur källan skrev den.
  return { ...rad, name, unit: normalizeUnit(unit) };
}
