import { describe, it, expect } from 'vitest';
import { computeCurrentTurn, computeTurnHistory } from '@veckis/shared';

describe('computeCurrentTurn (via shared re-export)', () => {
  it('null när rotation av', () => {
    expect(computeCurrentTurn({ rotation: false, assignedToMany: ['a'] }, 0)).toBeNull();
  });
  it('cyklar', () => {
    const c = { rotation: true, assignedToMany: ['a', 'b'] };
    expect(computeCurrentTurn(c, 0)).toBe('a');
    expect(computeCurrentTurn(c, 1)).toBe('b');
    expect(computeCurrentTurn(c, 2)).toBe('a');
  });
});

describe('computeTurnHistory', () => {
  it('tom map när rotation av', () => {
    const m = computeTurnHistory(
      { rotation: false, assignedToMany: ['a', 'b'] },
      [{ date: '2026-06-01', done: true }],
    );
    expect(m.size).toBe(0);
  });

  it('tom map när assignedToMany är tom', () => {
    const m = computeTurnHistory(
      { rotation: true, assignedToMany: [] },
      [{ date: '2026-06-01', done: true }],
    );
    expect(m.size).toBe(0);
  });

  it('done flyttar turen fram, missad gör inte', () => {
    const chore = { rotation: true, assignedToMany: ['a', 'b', 'c'] };
    const occ = [
      { date: '2026-06-01', done: true },   // a:s tur, a klarade → nästa tur b
      { date: '2026-06-02', done: false },  // b:s tur, b missade → nästa tur fortfarande b
      { date: '2026-06-03', done: true },   // b:s tur, b klarade → nästa tur c
      { date: '2026-06-04', done: true },   // c:s tur, c klarade → nästa tur a (wrap)
      { date: '2026-06-05', done: false },  // a:s tur, a missade
    ];
    const m = computeTurnHistory(chore, occ);
    expect(m.get('2026-06-01')).toBe('a');
    expect(m.get('2026-06-02')).toBe('b');
    expect(m.get('2026-06-03')).toBe('b');
    expect(m.get('2026-06-04')).toBe('c');
    expect(m.get('2026-06-05')).toBe('a');
  });

  it('alla missade → samma medlem hela vägen', () => {
    const m = computeTurnHistory(
      { rotation: true, assignedToMany: ['a', 'b'] },
      [
        { date: '2026-06-01', done: false },
        { date: '2026-06-02', done: false },
        { date: '2026-06-03', done: false },
      ],
    );
    expect(m.get('2026-06-01')).toBe('a');
    expect(m.get('2026-06-02')).toBe('a');
    expect(m.get('2026-06-03')).toBe('a');
  });

  it('alla klarade → roterar varje gång', () => {
    const m = computeTurnHistory(
      { rotation: true, assignedToMany: ['a', 'b'] },
      [
        { date: '2026-06-01', done: true },
        { date: '2026-06-02', done: true },
        { date: '2026-06-03', done: true },
      ],
    );
    expect(m.get('2026-06-01')).toBe('a');
    expect(m.get('2026-06-02')).toBe('b');
    expect(m.get('2026-06-03')).toBe('a');
  });
});
