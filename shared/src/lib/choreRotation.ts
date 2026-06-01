// Beräknar vems "tur" det är på en roterande syssla, deterministiskt så
// backend och frontend alltid är överens utan att vi behöver persistera turen.
//
// turn = list[occurrenceIndex % list.length] där occurrenceIndex = antalet
// completions hittills för chore:n.

export interface ChoreLikeForTurn {
  assignedToMany: string[];
  rotation: boolean;
}

export function computeCurrentTurn(chore: ChoreLikeForTurn, completionCount: number): string | null {
  if (!chore.rotation) return null;
  if (chore.assignedToMany.length === 0) return null;
  const idx = completionCount % chore.assignedToMany.length;
  return chore.assignedToMany[idx] ?? null;
}

/**
 * Beräknar vems tur det VAR på varje historisk occurrence (för rotation-historik).
 *
 * Iterar kronologiskt (oldest → newest). En klar (done) occurrence flyttar turen
 * fram, en missad gör inte (turen stannar kvar på missaren).
 *
 * Returnerar Map<occurrenceDateString, memberId>. Tom map om rotation=false
 * eller assignedToMany är tom.
 */
export function computeTurnHistory(
  chore: ChoreLikeForTurn,
  occurrences: Array<{ date: string; done: boolean }>,
): Map<string, string> {
  const out = new Map<string, string>();
  if (!chore.rotation) return out;
  if (chore.assignedToMany.length === 0) return out;
  let doneCount = 0;
  for (const o of occurrences) {
    out.set(o.date, chore.assignedToMany[doneCount % chore.assignedToMany.length] ?? '');
    if (o.done) doneCount++;
  }
  return out;
}
