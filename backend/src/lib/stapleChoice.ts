import type { StoreCategory } from '@prisma/client';
import { categorizeIngredient, kureratUndantag, legacyKeywordCategory, legacySubstringCategories } from './categorizeIngredient';

/**
 * Var en äldre basvaras kategori ett val eller en sparad gissning?
 *
 * Före 2026-09-30 sparades klassarens gissning på basvaran när den skapades,
 * utan att märkas — och lästes sedan som hushållets val (kakao → Bröd i fem
 * hushåll). Det går inte att veta säkert i efterhand, men en gissning lämnar
 * spår: den är lika med vad nyckelordsklassaren sa — i dag eller före
 * 2026-09-19, då den matchade delsträngar — eller med det globala aliasets
 * kategori (som föddes med samma gissning). Den kan också strida mot ett
 * handskrivet undantag ("krossade tomater" är torrvara, "torkad …" likaså):
 * undantagen skrevs just för att gissningen hamnade fel, och ett hushåll som
 * medvetet valt emot dem är ovanligt. Allt annat har någon ändrat — det är
 * ett val och får stå kvar.
 *
 * Felet åt ena hållet: ett val som råkar vara lika med gissningen räknas som
 * gissning. Då gäller den kurerade kedjan i stället, och hushållet får flytta
 * varan igen. Felet åt andra hållet — en gammal gissning som klassaren sedan
 * dess ändrat — syns i category-votes-rapporten.
 */
/**
 * Kategorier som brutits ut ur en annan senare: en vara som i dag hör till
 * nyckeln låg förut under värdet, och en gammal gissning står kvar där.
 * Ost bröts ut ur Mejeri (d1c9e88) — fetaost och halloumi låg kvar under
 * Mejeri; Baby & barn bröts ut ur Hygien och Övrigt (bb9f163).
 */
const FORMER_HOME: Partial<Record<StoreCategory, StoreCategory[]>> = {
  cheese: ['dairy_eggs'],
  baby_kids: ['personal_care', 'other'],
};

export function looksLikeGuess(name: string, stored: StoreCategory | string, aliasCategory: StoreCategory | string | null | undefined): boolean {
  if (stored === 'other') return true;
  if (stored === legacyKeywordCategory(name)) return true;
  const curated = categorizeIngredient(name);
  if (stored === curated) return true;
  if (FORMER_HOME[curated]?.includes(stored as StoreCategory)) return true;
  if (legacySubstringCategories(name).has(stored as StoreCategory)) return true;
  const exception = kureratUndantag(name);
  if (exception && stored !== exception) return true;
  return aliasCategory != null && stored === aliasCategory;
}

/** Den kategori en basvara ska visas med: hushållets val, annars den kurerade. */
export function effectiveStapleCategory(staple: { name: string; category: StoreCategory; categoryChosen: boolean | null }): StoreCategory {
  return staple.categoryChosen === false ? categorizeIngredient(staple.name) : staple.category;
}
