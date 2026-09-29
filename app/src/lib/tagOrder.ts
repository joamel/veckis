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
