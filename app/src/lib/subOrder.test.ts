import { describe, it, expect } from 'vitest';
import { sortedRestFor } from './subOrder';

describe('sortedRestFor', () => {
  it('faller tillbaka på taxonomins ordning när subOrder är tom', () => {
    expect(sortedRestFor(['a', 'b', 'c'], [])).toEqual(['a', 'b', 'c']);
  });

  it('respekterar sparad ordning för poster som finns i subOrder', () => {
    expect(sortedRestFor(['a', 'b', 'c'], ['c', 'a', 'b'])).toEqual(['c', 'a', 'b']);
  });

  it('placerar orangerade poster (ej i subOrder) sist, i taxonomiordning', () => {
    expect(sortedRestFor(['a', 'b', 'c'], ['c'])).toEqual(['c', 'a', 'b']);
  });

  it('ignorerar subOrder-poster som inte längre är dolda (t.ex. utbrutna eller borttagna)', () => {
    expect(sortedRestFor(['a', 'c'], ['b', 'c', 'a'])).toEqual(['c', 'a']);
  });

  it('hanterar tom notShown-lista', () => {
    expect(sortedRestFor([], ['a', 'b'])).toEqual([]);
  });
});
