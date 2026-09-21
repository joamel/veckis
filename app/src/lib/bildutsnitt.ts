/**
 * Vilket utsnitt av en receptbild som syns i den 16:9-ram den visas i.
 *
 * Bilden beskärs aldrig som fil. Hela originalet laddas upp, och det man
 * justerar är en fokuspunkt (0–1 per axel) som säger vilken del av bilden som
 * ska hamna i ramen. Därför går justeringen att ändra hur många gånger som
 * helst, och den fungerar även för URL-importerade bilder som ligger hos
 * tredje part och som vi inte kan beskära.
 *
 * Fokus 0 = vänster-/överkant i bild, 1 = höger-/nederkant, 0,5 = mitten
 * (vilket är precis vad resizeMode="cover" gjorde förut, utan val).
 */

export const MITTEN = 0.5;

export type Ram = { bredd: number; höjd: number };
export type Bildmått = { bredd: number; höjd: number };

export type Utsnitt = {
  /** Bildens mått uppskalade så att den täcker ramen. */
  bredd: number;
  höjd: number;
  /** Var bilden ska placeras i ramen (negativa tal — den sticker utanför). */
  x: number;
  y: number;
  /** Hur många px som hamnar utanför ramen, och alltså går att dra i. */
  överskottX: number;
  överskottY: number;
};

/**
 * Skalar bilden så den täcker ramen (samma som cover) och placerar den efter
 * fokuspunkten. Returnerar null för mått som inte går att räkna på, så
 * anroparen kan falla tillbaka på vanlig cover tills måtten är kända.
 */
export function räknaUtsnitt(
  ram: Ram,
  bild: Bildmått,
  fokusX: number | null = null,
  fokusY: number | null = null,
): Utsnitt | null {
  if (ram.bredd <= 0 || ram.höjd <= 0 || bild.bredd <= 0 || bild.höjd <= 0) return null;

  const skala = Math.max(ram.bredd / bild.bredd, ram.höjd / bild.höjd);
  const bredd = bild.bredd * skala;
  const höjd = bild.höjd * skala;

  // Avrundningen kan ge ett överskott på bråkdelar av en pixel åt det håll
  // som egentligen passar exakt. Det är inget att dra i.
  const överskottX = Math.max(0, bredd - ram.bredd);
  const överskottY = Math.max(0, höjd - ram.höjd);

  const fx = klampa(fokusX ?? MITTEN);
  const fy = klampa(fokusY ?? MITTEN);

  return { bredd, höjd, x: -överskottX * fx, y: -överskottY * fy, överskottX, överskottY };
}

/**
 * Ny fokuspunkt när man dragit `delta` px i bilden.
 *
 * Drar man bilden nedåt (positivt delta) vill man se mer av dess ovansida, och
 * fokus ska alltså minska. Utan överskott på axeln finns inget att dra i och
 * fokus lämnas orört — annars skulle ett drag i sidled på en bild som redan
 * passar i bredd ändra ett värde som inte syns.
 */
export function fokusEfterDrag(fokus: number | null, delta: number, överskott: number): number {
  if (överskott <= 0) return klampa(fokus ?? MITTEN);
  return klampa((fokus ?? MITTEN) - delta / överskott);
}

/** Fokus som faktiskt är värt att spara — mitten är detsamma som inget val. */
export function ärJusterad(fokusX: number | null, fokusY: number | null): boolean {
  return (fokusX != null && fokusX !== MITTEN) || (fokusY != null && fokusY !== MITTEN);
}

function klampa(v: number): number {
  if (Number.isNaN(v)) return MITTEN;
  return Math.max(0, Math.min(1, v));
}
