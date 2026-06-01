// Re-exports från @veckis/shared så både backend och frontend räknar likadant.
// Lokal wrapper för Prisma-rader så vi slipper passa completion-count manuellt.

import { computeCurrentTurn as sharedComputeCurrentTurn, type ChoreLikeForTurn } from '@veckis/shared';
import type { Chore, ChoreCompletion } from '@prisma/client';

export const computeCurrentTurn = sharedComputeCurrentTurn;
export type { ChoreLikeForTurn };

/** För Prisma-rader: räkna completions från include:n. */
export function turnFromChore(chore: Chore & { completions?: ChoreCompletion[] }): string | null {
  return computeCurrentTurn(chore, chore.completions?.length ?? 0);
}
