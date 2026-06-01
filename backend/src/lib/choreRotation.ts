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

// --- Notification recipient resolution ----------------------------------------
//
// Vem ska få push-notis för en förfallen syssla? Lyfts ut till en ren funktion
// så fan-out-beteendet kan testas utan Prisma-mock.

export interface ChoreLikeForRecipients {
  assignedTo: string | null;
  assignedToMany: string[];
  rotation: boolean;
  isShared: boolean;
}

export interface RecipientContext {
  /** memberId → clerkUserId. Lokala profiler (utan clerkUserId) saknas helt
   *  i kartan så lookup ger undefined och filtreras automatiskt bort. */
  memberClerk: Map<string, string>;
  /** Alla Clerk-användare i hushållet — fallback när chore saknar tilldelad. */
  householdClerks: string[];
}

/**
 * Beslutsträd för push-mottagare:
 *  1. rotation=true + 2+ tilldelade → bara turpersonen (om hen är Clerk-user)
 *  2. assignedToMany har medlemmar → alla Clerk-users i listan
 *  3. legacy assignedTo satt → den användaren
 *  4. inget tilldelat OCH isShared → hela hushållet
 *  5. annars → tom (privata sysslor utan tilldelning ping:as inte)
 *
 * Lokala profiler (clerkUserId=null) filtreras alltid bort. Duplikater rensas.
 */
export function selectChoreRecipients(
  chore: ChoreLikeForRecipients,
  completionCount: number,
  ctx: RecipientContext,
): string[] {
  let assignedMemberIds = chore.assignedToMany.length > 0
    ? chore.assignedToMany
    : chore.assignedTo ? [chore.assignedTo] : [];

  if (chore.rotation && assignedMemberIds.length >= 2) {
    const turn = computeCurrentTurn(chore, completionCount);
    assignedMemberIds = turn ? [turn] : [];
  }

  let recipients = assignedMemberIds
    .map(id => ctx.memberClerk.get(id))
    .filter((x): x is string => !!x);

  if (recipients.length === 0 && chore.isShared) {
    recipients = ctx.householdClerks;
  }

  return [...new Set(recipients)];
}
