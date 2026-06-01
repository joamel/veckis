import { describe, it, expect } from 'vitest';
import { computeCurrentTurn, selectChoreRecipients } from './choreRotation';

describe('computeCurrentTurn', () => {
  it('returns null when rotation is off', () => {
    expect(computeCurrentTurn({ rotation: false, assignedToMany: ['a', 'b'] }, 0)).toBeNull();
  });

  it('returns null when assignedToMany is empty', () => {
    expect(computeCurrentTurn({ rotation: true, assignedToMany: [] }, 0)).toBeNull();
  });

  it('cycles through members deterministically', () => {
    const chore = { rotation: true, assignedToMany: ['a', 'b', 'c'] };
    expect(computeCurrentTurn(chore, 0)).toBe('a');
    expect(computeCurrentTurn(chore, 1)).toBe('b');
    expect(computeCurrentTurn(chore, 2)).toBe('c');
    expect(computeCurrentTurn(chore, 3)).toBe('a'); // wraps
    expect(computeCurrentTurn(chore, 99)).toBe('a'); // 99 % 3 = 0
  });

  it('single-member list always returns that member', () => {
    const chore = { rotation: true, assignedToMany: ['only'] };
    expect(computeCurrentTurn(chore, 0)).toBe('only');
    expect(computeCurrentTurn(chore, 5)).toBe('only');
  });
});

describe('selectChoreRecipients', () => {
  // Bygg ett "hushåll": 3 Clerk-users + 1 lokal profil.
  const ctx = {
    memberClerk: new Map<string, string>([
      ['mem-anna', 'clerk-anna'],
      ['mem-bo', 'clerk-bo'],
      ['mem-carl', 'clerk-carl'],
      // mem-local saknas (lokal profil utan Clerk-konto)
    ]),
    householdClerks: ['clerk-anna', 'clerk-bo', 'clerk-carl'],
  };

  it('rotation=true pingar bara turpersonen', () => {
    const chore = {
      assignedTo: 'mem-anna',
      assignedToMany: ['mem-anna', 'mem-bo', 'mem-carl'],
      rotation: true,
      isShared: true,
    };
    // completionCount=0 → turn = first (anna)
    expect(selectChoreRecipients(chore, 0, ctx)).toEqual(['clerk-anna']);
    // completionCount=1 → bo
    expect(selectChoreRecipients(chore, 1, ctx)).toEqual(['clerk-bo']);
    // completionCount=4 → 4 % 3 = 1 → bo
    expect(selectChoreRecipients(chore, 4, ctx)).toEqual(['clerk-bo']);
  });

  it('rotation=false pingar alla i listan', () => {
    const chore = {
      assignedTo: 'mem-anna',
      assignedToMany: ['mem-anna', 'mem-bo'],
      rotation: false,
      isShared: true,
    };
    expect(selectChoreRecipients(chore, 0, ctx).sort()).toEqual(['clerk-anna', 'clerk-bo']);
  });

  it('faller tillbaka till legacy assignedTo om many är tom', () => {
    const chore = {
      assignedTo: 'mem-bo',
      assignedToMany: [],
      rotation: false,
      isShared: true,
    };
    expect(selectChoreRecipients(chore, 0, ctx)).toEqual(['clerk-bo']);
  });

  it('faller tillbaka till hela hushållet när inget är tilldelat OCH isShared=true', () => {
    const chore = {
      assignedTo: null,
      assignedToMany: [],
      rotation: false,
      isShared: true,
    };
    expect(selectChoreRecipients(chore, 0, ctx).sort()).toEqual(['clerk-anna', 'clerk-bo', 'clerk-carl']);
  });

  it('returnerar tom array när inget är tilldelat och isShared=false', () => {
    const chore = {
      assignedTo: null,
      assignedToMany: [],
      rotation: false,
      isShared: false,
    };
    expect(selectChoreRecipients(chore, 0, ctx)).toEqual([]);
  });

  it('filtrerar bort lokala profiler (saknas i memberClerk)', () => {
    const chore = {
      assignedTo: 'mem-local',
      assignedToMany: ['mem-anna', 'mem-local'],
      rotation: false,
      isShared: true,
    };
    expect(selectChoreRecipients(chore, 0, ctx)).toEqual(['clerk-anna']);
  });

  it('faller tillbaka till hushållet om alla tilldelade är lokala profiler', () => {
    const chore = {
      assignedTo: 'mem-local',
      assignedToMany: ['mem-local'],
      rotation: false,
      isShared: true,
    };
    expect(selectChoreRecipients(chore, 0, ctx).sort()).toEqual(['clerk-anna', 'clerk-bo', 'clerk-carl']);
  });

  it('dedupar mottagare (samma medlem dyker upp två gånger)', () => {
    const chore = {
      assignedTo: 'mem-anna',
      assignedToMany: ['mem-anna', 'mem-anna', 'mem-bo'],
      rotation: false,
      isShared: true,
    };
    expect(selectChoreRecipients(chore, 0, ctx).sort()).toEqual(['clerk-anna', 'clerk-bo']);
  });

  it('rotation=true med en enda medlem → den medlemmen', () => {
    const chore = {
      assignedTo: 'mem-anna',
      assignedToMany: ['mem-anna'],
      rotation: true, // egentligen meningslöst med 1, men ska inte krascha
      isShared: true,
    };
    // computeCurrentTurn behandlar rotation=true + 1 medlem som "alltid den"
    // men selectChoreRecipients vidarekopplar bara om längd >= 2 → fall tillbaka
    // till hela listan = [mem-anna] = clerk-anna.
    expect(selectChoreRecipients(chore, 0, ctx)).toEqual(['clerk-anna']);
  });
});
