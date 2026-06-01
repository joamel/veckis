import { describe, it, expect } from 'vitest';
import { computeCurrentTurn } from './choreRotation';

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
