import { describe, it, expect } from 'vitest';
import { buildPerformerOptions, type PerformerMember, type PerformerChore } from './performerOptions';

const MEMBERS: PerformerMember[] = [
  { id: 'a', clerkUserId: 'clerk_a', displayName: 'Anna' },
  { id: 'b', clerkUserId: 'clerk_b', displayName: 'Bo' },
  { id: 'c', clerkUserId: null, displayName: 'Barnet' }, // lokal profil (utan konto)
];

function chore(partial: Partial<PerformerChore>): PerformerChore {
  return { assignedTo: null, assignedToMany: [], rotation: false, completions: { length: 0 }, ...partial };
}

describe('buildPerformerOptions', () => {
  it('auto när ingen är tilldelad', () => {
    expect(buildPerformerOptions(chore({}), MEMBERS, 'clerk_a')).toEqual({ kind: 'auto' });
  });

  it('auto för en enskild Clerk-användare utan rotation', () => {
    expect(buildPerformerOptions(chore({ assignedToMany: ['a'] }), MEMBERS, 'clerk_a')).toEqual({ kind: 'auto' });
  });

  it('auto för en enskild lokal profil (en ägare = inga val att göra)', () => {
    const res = buildPerformerOptions(chore({ assignedToMany: ['c'] }), MEMBERS, 'clerk_a');
    expect(res.kind).toBe('auto');
  });

  it('rotation: turpersonen läggs överst med " (tur)"', () => {
    // 2 medlemmar, rotation på, 0 completions → turen är första i listan (a).
    const res = buildPerformerOptions(
      chore({ assignedToMany: ['a', 'b'], rotation: true, completions: { length: 0 } }),
      MEMBERS,
      'clerk_b',
    );
    expect(res.kind).toBe('choose');
    if (res.kind !== 'choose') return;
    expect(res.options[0]).toEqual({ id: 'a', label: 'Anna (tur)' });
    // Bo finns med (utan extra suffix eftersom hen är inloggad = redan tilldelad)
    expect(res.options.map(o => o.id)).toContain('b');
  });

  it('rotationen flyttas med completions.length (deterministiskt)', () => {
    const res = buildPerformerOptions(
      chore({ assignedToMany: ['a', 'b'], rotation: true, completions: { length: 1 } }),
      MEMBERS,
      'clerk_a',
    );
    if (res.kind !== 'choose') throw new Error('förväntade choose');
    // 1 completion → turen har flyttat till b.
    expect(res.options[0]).toEqual({ id: 'b', label: 'Bo (tur)' });
  });

  it('lägger till "jag" sist när jag inte är tilldelad', () => {
    const res = buildPerformerOptions(
      chore({ assignedToMany: ['a', 'c'] }),
      MEMBERS,
      'clerk_b', // Bo är inte tilldelad
    );
    if (res.kind !== 'choose') throw new Error('förväntade choose');
    expect(res.options.at(-1)).toEqual({ id: 'b', label: 'Bo (du)' });
  });

  it('dedupar — ingen dubblett när turpersonen även är jag', () => {
    const res = buildPerformerOptions(
      chore({ assignedToMany: ['a', 'b'], rotation: true, completions: { length: 0 } }),
      MEMBERS,
      'clerk_a', // jag = a = turpersonen
    );
    if (res.kind !== 'choose') throw new Error('förväntade choose');
    const aCount = res.options.filter(o => o.id === 'a').length;
    expect(aCount).toBe(1);
    expect(res.options[0].label).toBe('Anna (tur)');
  });
});
