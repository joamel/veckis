// Bygger den korta etiketten "Anna · Bertil" / "Annas tur · Nästa: Bertil"
// som visas under en sysslas titel. Tre fall:
//
// 1. Ingen tilldelning  → null (raden visas inte).
// 2. En eller flera tilldelade utan rotation → namnen joined på " · ".
// 3. Två+ tilldelade med rotation=true → "<turperson>s tur" + nästa.
//
// Rotation beräknas via @veckis/shared.computeCurrentTurn så frontend och
// backend ger samma resultat utan att skicka turen i payloaden.
//
// Extraherad ur chores.tsx för testbarhet — den inline-versionen där är nu
// en tunn wrapper som bara matar in members och anropar denna funktion.
import { computeCurrentTurn } from '@veckis/shared';

interface ChoreLike {
  assignedTo?: string | null;
  assignedToMany?: string[];
  rotation?: boolean;
  /** Bara längden används; element-shape spelar ingen roll. */
  completions: ReadonlyArray<unknown>;
}

interface MemberLike {
  id: string;
  displayName: string;
}

export function buildAssignedLabel(chore: ChoreLike, members: ReadonlyArray<MemberLike>): string | null {
  const ids = chore.assignedToMany?.length
    ? chore.assignedToMany
    : (chore.assignedTo ? [chore.assignedTo] : []);
  if (ids.length === 0) return null;

  const nameById = new Map(members.map(m => [m.id, m.displayName]));
  const names = ids.map(id => nameById.get(id) ?? '').filter(Boolean);
  if (names.length === 0) return null;

  if (chore.rotation && ids.length >= 2) {
    const currentId = computeCurrentTurn(
      { rotation: true, assignedToMany: ids },
      chore.completions.length,
    );
    const nextId = computeCurrentTurn(
      { rotation: true, assignedToMany: ids },
      chore.completions.length + 1,
    );
    const currentName = currentId ? nameById.get(currentId) : null;
    const nextName = nextId && nextId !== currentId ? nameById.get(nextId) : null;
    return currentName ? `${currentName}s tur` : names.join(' · ');
  }

  return names.join(' · ');
}
