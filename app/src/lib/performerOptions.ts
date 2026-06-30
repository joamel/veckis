import { computeCurrentTurn } from '@veckis/shared';

export interface PerformerMember {
  id: string;
  clerkUserId: string | null;
  displayName: string;
}

export interface PerformerChore {
  assignedTo: string | null;
  assignedToMany: string[];
  rotation: boolean;
  completions: { length: number };
}

export type PerformerChoice =
  | { kind: 'auto' } // ingen valdialog behövs → utföraren är underförstådd (null)
  | { kind: 'choose'; options: { id: string; label: string }[] };

/**
 * Ren logik för "Vem gjorde sysslan?"-väljaren (utbruten ur chores.tsx).
 *
 * Auto (ingen dialog) när:
 *  - ingen är tilldelad, eller
 *  - exakt en tilldelad Clerk-användare utan rotation (då är utföraren given).
 *
 * Annars: en ordnad lista — turpersonen överst (" (tur)") vid rotation, sedan
 * övriga tilldelade, sedan "jag" (" (du)") om jag inte redan är med. Dedupas.
 */
export function buildPerformerOptions(
  chore: PerformerChore,
  members: PerformerMember[],
  userId: string | null | undefined,
): PerformerChoice {
  const assignedIds = chore.assignedToMany?.length ? chore.assignedToMany : (chore.assignedTo ? [chore.assignedTo] : []);
  const assignedMembers = assignedIds
    .map(id => members.find(m => m.id === id))
    .filter((m): m is PerformerMember => !!m);
  const hasLocalProfile = assignedMembers.some(m => m.clerkUserId === null);
  const isRotating = !!chore.rotation && assignedMembers.length >= 2;

  if (assignedMembers.length === 0) return { kind: 'auto' };
  if (!isRotating && assignedMembers.length === 1) return { kind: 'auto' };

  const selfMember = userId ? members.find(m => m.clerkUserId === userId) : null;
  const turnId = isRotating
    ? computeCurrentTurn({ rotation: true, assignedToMany: assignedIds }, chore.completions.length)
    : null;

  const seen = new Set<string>();
  const options: { id: string; label: string }[] = [];
  const push = (id: string | null, suffix = '') => {
    if (!id || seen.has(id)) return;
    const m = members.find(x => x.id === id);
    if (!m) return;
    seen.add(id);
    options.push({ id: m.id, label: m.displayName + suffix });
  };
  if (turnId) push(turnId, ' (tur)');
  for (const m of assignedMembers) push(m.id);
  if (selfMember) push(selfMember.id, ' (du)');

  return { kind: 'choose', options };
}
