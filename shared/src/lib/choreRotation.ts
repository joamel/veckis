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
