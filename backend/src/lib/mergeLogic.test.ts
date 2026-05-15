import { describe, it, expect } from 'vitest';
import { planFullUnmerge, findRoot, MergeNode } from './mergeLogic';

describe('planFullUnmerge', () => {
  it('returns just the root as a container when there are no children', () => {
    const items: MergeNode[] = [
      { id: 'C', mergedIntoId: null },
    ];
    expect(planFullUnmerge(items, 'C')).toEqual({
      restoreLeaves: [],
      deleteContainers: ['C'],
    });
  });

  it('restores two leaves under a single container and deletes the container', () => {
    const items: MergeNode[] = [
      { id: 'C', mergedIntoId: null },
      { id: 'A', mergedIntoId: 'C' },
      { id: 'B', mergedIntoId: 'C' },
    ];
    const plan = planFullUnmerge(items, 'C');
    expect(new Set(plan.restoreLeaves)).toEqual(new Set(['A', 'B']));
    expect(plan.deleteContainers).toEqual(['C']);
  });

  it('handles a chained merge (A+B → C, then C+D → E)', () => {
    const items: MergeNode[] = [
      { id: 'E', mergedIntoId: null },
      { id: 'C', mergedIntoId: 'E' },
      { id: 'D', mergedIntoId: 'E' },
      { id: 'A', mergedIntoId: 'C' },
      { id: 'B', mergedIntoId: 'C' },
    ];
    const plan = planFullUnmerge(items, 'E');
    expect(new Set(plan.restoreLeaves)).toEqual(new Set(['A', 'B', 'D']));
    expect(new Set(plan.deleteContainers)).toEqual(new Set(['E', 'C']));
  });

  it('does not touch unrelated items', () => {
    const items: MergeNode[] = [
      { id: 'C', mergedIntoId: null },
      { id: 'A', mergedIntoId: 'C' },
      { id: 'X', mergedIntoId: null },   // unrelated visible item
      { id: 'Y', mergedIntoId: 'OTHER' }, // child of a different container
    ];
    const plan = planFullUnmerge(items, 'C');
    expect(plan.restoreLeaves).toEqual(['A']);
    expect(plan.deleteContainers).toEqual(['C']);
  });

  it('treats a single-child container correctly (root deleted, child restored)', () => {
    const items: MergeNode[] = [
      { id: 'C', mergedIntoId: null },
      { id: 'A', mergedIntoId: 'C' },
    ];
    expect(planFullUnmerge(items, 'C')).toEqual({
      restoreLeaves: ['A'],
      deleteContainers: ['C'],
    });
  });

  it('regression: leaf passed as root via findRoot does not get incorrectly deleted as leaf', () => {
    // If by mistake we passed a leaf id as root, we should still treat it as a container
    // (only the caller knows; this is a safeguard for the deleted "fullyUnmerge of a leaf" bug)
    const items: MergeNode[] = [
      { id: 'L', mergedIntoId: null },
    ];
    const plan = planFullUnmerge(items, 'L');
    expect(plan.restoreLeaves).toEqual([]);
    expect(plan.deleteContainers).toEqual(['L']);
  });
});

describe('findRoot', () => {
  it('returns the item itself if it has no parent', () => {
    const items: MergeNode[] = [{ id: 'X', mergedIntoId: null }];
    expect(findRoot(items, 'X')).toBe('X');
  });

  it('walks up one level to the root', () => {
    const items: MergeNode[] = [
      { id: 'C', mergedIntoId: null },
      { id: 'A', mergedIntoId: 'C' },
    ];
    expect(findRoot(items, 'A')).toBe('C');
  });

  it('walks up multiple levels through a chain', () => {
    const items: MergeNode[] = [
      { id: 'E', mergedIntoId: null },
      { id: 'C', mergedIntoId: 'E' },
      { id: 'A', mergedIntoId: 'C' },
    ];
    expect(findRoot(items, 'A')).toBe('E');
  });

  it('does not loop indefinitely on a cycle (safety)', () => {
    const items: MergeNode[] = [
      { id: 'X', mergedIntoId: 'Y' },
      { id: 'Y', mergedIntoId: 'X' },
    ];
    // Should terminate; behavior on a cycle is implementation-defined, but no infinite loop
    expect(() => findRoot(items, 'X')).not.toThrow();
  });
});

describe('soft-merge feature scenarios (end-to-end via pure planning)', () => {
  // These tests model the exact scenarios reported as bugs and verify
  // that the pure logic produces the correct outcome.

  it('removing rätt #1 from a (1 tsk + 1 krm → 1 burk) merge leaves only #2 visible', () => {
    // State after merge: container C holds the total; A (rätt #1) and B (rätt #2) hidden under C
    const items: MergeNode[] = [
      { id: 'C', mergedIntoId: null },
      { id: 'A', mergedIntoId: 'C' },
      { id: 'B', mergedIntoId: 'C' },
    ];

    // User removes rätt #1 → backend gets menuItemId=A.menuItemId.
    // It walks up from A to root C, then unmerges.
    const root = findRoot(items, 'A');
    expect(root).toBe('C');

    const plan = planFullUnmerge(items, root);
    expect(plan.deleteContainers).toEqual(['C']);
    expect(new Set(plan.restoreLeaves)).toEqual(new Set(['A', 'B']));

    // After unmerge, both A and B are visible. The route then deletes A by
    // its menuItemId match. Simulating that step:
    const surviving = plan.restoreLeaves.filter(id => id !== 'A');
    expect(surviving).toEqual(['B']);
  });

  it('removing rätt with chained merge (A+B → C, C+D → E) and rätt #1 owns A: D and B survive', () => {
    const items: MergeNode[] = [
      { id: 'E', mergedIntoId: null },
      { id: 'C', mergedIntoId: 'E' },
      { id: 'D', mergedIntoId: 'E' },
      { id: 'A', mergedIntoId: 'C' },
      { id: 'B', mergedIntoId: 'C' },
    ];
    const root = findRoot(items, 'A');
    expect(root).toBe('E');

    const plan = planFullUnmerge(items, root);
    expect(new Set(plan.deleteContainers)).toEqual(new Set(['E', 'C']));
    expect(new Set(plan.restoreLeaves)).toEqual(new Set(['A', 'B', 'D']));

    // After unmerge + delete of A (its menuItemId is gone), B and D remain visible
    const surviving = plan.restoreLeaves.filter(id => id !== 'A');
    expect(new Set(surviving)).toEqual(new Set(['B', 'D']));
  });
});
