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
  zoom: number | null = null,
): Utsnitt | null {
  if (ram.bredd <= 0 || ram.höjd <= 0 || bild.bredd <= 0 || bild.höjd <= 0) return null;

  // Zoom multipliceras på cover-skalan. Under 1 skulle ramen bli tom, så det
  // går bara att zooma IN — och överskottet att dra i växer med zoomen.
  const skala = Math.max(ram.bredd / bild.bredd, ram.höjd / bild.höjd) * klampaZoom(zoom);
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

/** Utsnitt som faktiskt är värt att spara — mitten utan zoom är detsamma
 *  som inget val. */
export function ärJusterad(fokusX: number | null, fokusY: number | null, zoom: number | null = null): boolean {
  return (fokusX != null && fokusX !== MITTEN) || (fokusY != null && fokusY !== MITTEN) || klampaZoom(zoom) > 1;
}

/** Aldrig under 1 (tom ram), och null/NaN betyder ingen zoom. */
export function klampaZoom(zoom: number | null | undefined): number {
  if (zoom == null || Number.isNaN(zoom)) return 1;
  return Math.max(1, zoom);
}

/**
 * Hur långt det går att zooma. Minst MIN_ZOOM_TAK för ALLA bilder, och högre
 * för skarpa bilder med pixlar att ta av, upp till MAX_ZOOM.
 *
 * Första versionen satte taket helt efter upplösningen (en bildpixel fick bli
 * högst 1,5 skärmpixlar). Det slog tillbaka: en lågupplöst bloggbild är redan
 * förstorad mer än så bara för att fylla ramen på en telefon, så taket blev
 * 1 — ingen zoom alls, på just de bilder som behövde den för att bli av med
 * en inbakad kant (matpajen, 2026-09-27). Blir en bild suddig ser man det och
 * backar; det är bättre än att appen bestämmer att man inte får zooma.
 */
export const MAX_ZOOM = 4;
export const MIN_ZOOM_TAK = 2;
const MAX_UPPFÖRSTORING = 1.5;
export function maxZoom(ram: Ram, bild: Bildmått, pixeltäthet: number): number {
  if (ram.bredd <= 0 || ram.höjd <= 0 || bild.bredd <= 0 || bild.höjd <= 0) return MIN_ZOOM_TAK;
  const cover = Math.max(ram.bredd / bild.bredd, ram.höjd / bild.höjd);
  const efterUpplösning = MAX_UPPFÖRSTORING / (cover * Math.max(1, pixeltäthet));
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM_TAK, efterUpplösning));
}

function klampa(v: number): number {
  if (Number.isNaN(v)) return MITTEN;
  return Math.max(0, Math.min(1, v));
}
