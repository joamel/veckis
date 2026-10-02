/**
 * Ordningen i receptlistans taggrad:
 *  1. favorittaggen — alltid först, fäst eller inte
 *  2. fästa taggar, flest recept först
 *  3. resten, flest recept först
 * Lika många recept → bokstavsordning. Bara taggar som något recept har visas:
 * en fäst tagg som inget recept längre har ligger kvar sparad och kommer
 * tillbaka om taggen används igen.
 */
export function orderTags(recipeTags: Array<string[] | null | undefined>, pinned: string[], favorite: string): string[] {
  const counts = new Map<string, number>();
  for (const tags of recipeTags) for (const t of tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
  const byCount = (a: string, b: string) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a.localeCompare(b, 'sv');
  const rest = [...counts.keys()].filter(t => t !== favorite);
  return [
    ...(counts.has(favorite) ? [favorite] : []),
    ...rest.filter(t => pinned.includes(t)).sort(byCount),
    ...rest.filter(t => !pinned.includes(t)).sort(byCount),
  ];
}

export type TagChip = { tag: string; count: number; active: boolean };

/**
 * Taggraden när man filtrerar: varje vald tagg smalnar av (receptet måste ha
 * ALLA), och raden visar bara taggar som går att kombinera med det redan
 * valda — en tagg som skulle ge noll träffar döljs, så man aldrig hamnar på en
 * tom lista. count = hur många av de matchande recepten som har taggen, alltså
 * vad listan blir om man trycker på den.
 *
 * Valda taggar först, sedan resten i samma ordning som orderTags (favoriter,
 * fästa, flest träffar) — räknat på de recept som matchar just nu.
 */
export function tagChips(
  recipeTags: Array<string[] | null | undefined>,
  active: Set<string>,
  pinned: string[],
  favorite: string,
): TagChip[] {
  const matching = recipeTags.filter(tags => [...active].every(t => (tags ?? []).includes(t)));
  const counts = new Map<string, number>();
  for (const tags of matching) for (const t of tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
  // Valda taggar i radens vanliga ordning — de ligger kvar även om sökningen gett noll.
  const all = orderTags(recipeTags, pinned, favorite);
  const chosen = [...active].sort((a, b) => (all.indexOf(a) + 1 || Infinity) - (all.indexOf(b) + 1 || Infinity));
  const rest = orderTags(matching, pinned, favorite).filter(t => !active.has(t));
  return [
    ...chosen.map(tag => ({ tag, count: counts.get(tag) ?? 0, active: true })),
    ...rest.map(tag => ({ tag, count: counts.get(tag) ?? 0, active: false })),
  ];
}
