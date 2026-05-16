import { describe, it, expect } from 'vitest';
import { syncAssignedTo } from './assignedToSync';

describe('syncAssignedTo', () => {
  it('derives singular from array when array given', () => {
    expect(syncAssignedTo({ assignedToMany: ['a', 'b'] })).toEqual({
      assignedToMany: ['a', 'b'],
      assignedTo: 'a',
    });
  });

  it('sets singular to null when array is empty', () => {
    expect(syncAssignedTo({ assignedToMany: [] })).toEqual({
      assignedToMany: [],
      assignedTo: null,
    });
  });

  it('wraps singular into array when only singular given', () => {
    expect(syncAssignedTo({ assignedTo: 'user-1' })).toEqual({
      assignedTo: 'user-1',
      assignedToMany: ['user-1'],
    });
  });

  it('clears array when singular is null', () => {
    expect(syncAssignedTo({ assignedTo: null })).toEqual({
      assignedTo: null,
      assignedToMany: [],
    });
  });

  it('leaves both undefined when neither is given (partial update)', () => {
    expect(syncAssignedTo({ title: 'x' } as never)).toEqual({ title: 'x' });
  });

  it('prefers many over singular when both are given', () => {
    expect(syncAssignedTo({ assignedTo: 'a', assignedToMany: ['b', 'c'] })).toEqual({
      assignedTo: 'b',
      assignedToMany: ['b', 'c'],
    });
  });

  it('does not mutate input', () => {
    const input = { assignedTo: 'x' };
    const result = syncAssignedTo(input);
    expect(input).toEqual({ assignedTo: 'x' });
    expect(result).not.toBe(input);
  });
});
