// Ordnar EJ utbrutna (dolda) standard-subs för en parent: poster som redan
// finns i den sparade `subOrder`-listan kommer först (i den ordningen),
// resten faller tillbaka på taxonomins standardordning (ordningen de kommer
// i via `notShown`). Gör det möjligt att sortera subs UTAN att först behöva
// bocka i/visa dem.
export function sortedRestFor<T extends string>(notShown: T[], subOrder: string[]): T[] {
  const ranked = subOrder.filter((s): s is T => notShown.includes(s as T));
  const unranked = notShown.filter(s => !subOrder.includes(s));
  return [...ranked, ...unranked];
}
