import { describe, it, expect } from 'vitest';
import { minimeraLagning, återupptaLagning, pågåendeLagningar, type CookSession } from './cookSessions';

const lagning = (recipeId: string, extra: Partial<CookSession> = {}): CookSession => ({
  recipeId, title: `Rätt ${recipeId}`, step: 2, checked: [['ing1', 1]],
  timers: [{ step: 2, endsAt: Date.now() + 60_000, notisId: 'notis-1' }], servings: null, ...extra,
});

describe('minimerade lagningar', () => {
  it('återupptas med steg, avbockningar och timrar — och försvinner ur listen', () => {
    minimeraLagning(lagning('a'));
    expect(pågåendeLagningar().map(l => l.recipeId)).toContain('a');
    const s = återupptaLagning('a');
    expect(s?.step).toBe(2);
    expect(s?.checked).toEqual([['ing1', 1]]);
    expect(s?.timers[0].notisId).toBe('notis-1');
    expect(pågåendeLagningar().map(l => l.recipeId)).not.toContain('a');
  });

  it('flera lagningar samtidigt, en per recept', () => {
    minimeraLagning(lagning('b'));
    minimeraLagning(lagning('c'));
    minimeraLagning(lagning('b', { step: 4 }));
    const ids = pågåendeLagningar().map(l => l.recipeId).sort();
    expect(ids).toEqual(['b', 'c']);
    expect(återupptaLagning('b')?.step).toBe(4);
    återupptaLagning('c');
  });

  it('ingen lagning att återuppta ger null', () => {
    expect(återupptaLagning('finns-inte')).toBeNull();
  });
});
