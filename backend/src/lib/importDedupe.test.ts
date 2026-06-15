import { describe, it, expect } from 'vitest';
import {
  planIncomingMatch,
  planAutoMerge,
  IncomingIngredient,
  ExistingItem,
} from './importDedupe';

function existing(overrides: Partial<ExistingItem>): ExistingItem {
  return {
    id: 'x',
    name: 'salt',
    unit: 'tsk',
    quantity: 1,
    menuItemId: null,
    mergedIntoId: null,
    isChecked: false,
    category: 'canned_dry',
    ...overrides,
  };
}

function incoming(overrides: Partial<IncomingIngredient>): IncomingIngredient {
  return { name: 'salt', unit: 'tsk', quantity: 1, ...overrides };
}

describe('Scenario 1 — import veckomeny into list with existing items (same unit)', () => {
  it('merges existing unbound salt with new menuItem-tagged salt and stays as one row', () => {
    const existing1 = existing({ id: 'e1', quantity: 1 });
    const plan = planIncomingMatch(
      [incoming({ quantity: 1, menuItemId: 'A' })],
      [existing1],
    );
    expect(plan.toCreate).toEqual([]);
    expect(plan.toUpdate).toEqual([{ id: 'e1', quantity: 2, name: 'salt' }]);
    // No auto-merge needed (1 visible row)
    expect(planAutoMerge([{ ...existing1, quantity: 2 }])).toEqual([]);
  });
});

describe('Scenario 2 — transfer veckomeny to list with same ingredients/units', () => {
  it('two existing salts from earlier transfers get auto-merged after a new identical import', () => {
    // After phase 1: existing salt from menuItem A bumped, new salt from menuItem B created
    const eA = existing({ id: 'eA', menuItemId: 'A', quantity: 2 });
    const eB = existing({ id: 'eB', menuItemId: 'B', quantity: 1 });
    const groups = planAutoMerge([eA, eB]);
    expect(groups).toHaveLength(1);
    expect(groups[0].ids.sort()).toEqual(['eA', 'eB']);
    // 2 tsk + 1 tsk = 15 ml = 1 msk (combineQuantities normalises to largest unit)
    expect(groups[0].totalQty).toBe(1);
    expect(groups[0].unit).toBe('msk');
  });
});

describe('Scenario 3 — direct recipe transfer to list with same ingredients', () => {
  it('recipe transfer (no menuItemId) merges into existing unbound row', () => {
    const e1 = existing({ id: 'e1', quantity: 2 });
    const plan = planIncomingMatch(
      [incoming({ name: 'salt', unit: 'tsk', quantity: 1 })], // no menuItemId
      [e1],
    );
    expect(plan.toCreate).toEqual([]);
    expect(plan.toUpdate).toEqual([{ id: 'e1', quantity: 3, name: 'salt' }]);
  });

  it('recipe transfer (no menuItemId) does NOT merge into menuItem-tagged existing → creates new', () => {
    // Per current rules: unbound incoming only merges with unbound existing
    const tagged = existing({ id: 'tA', menuItemId: 'A', quantity: 2 });
    const plan = planIncomingMatch(
      [incoming({ quantity: 1 })], // no menuItemId
      [tagged],
    );
    expect(plan.toUpdate).toEqual([]);
    expect(plan.toCreate).toHaveLength(1);
    // But the auto-merge picks it up after creation
    const after = [tagged, existing({ id: 'new', quantity: 1 })];
    const groups = planAutoMerge(after);
    expect(groups[0].ids.sort()).toEqual(['new', 'tA']);
    // 2 tsk + 1 tsk = 15 ml = 1 msk
    expect(groups[0].totalQty).toBe(1);
  });
});

describe('Scenario 4 — same maträtt imported twice from same veckomeny', () => {
  it('second import bumps existing menuItem-tagged row', () => {
    const e = existing({ id: 'e', menuItemId: 'A', quantity: 1 });
    const plan = planIncomingMatch(
      [incoming({ quantity: 1, menuItemId: 'A' })],
      [e],
    );
    expect(plan.toCreate).toEqual([]);
    expect(plan.toUpdate).toEqual([{ id: 'e', quantity: 2, name: 'salt' }]);
  });
});

describe('Scenario 5 — same recipe from two different veckomenyer', () => {
  it('different menuItemIds create separate rows, then auto-merge wraps them', () => {
    // Phase 1 — incoming from menuItem A. List initially empty.
    const phase1 = planIncomingMatch(
      [incoming({ menuItemId: 'A' })],
      [],
    );
    expect(phase1.toCreate).toHaveLength(1);
    expect(phase1.toUpdate).toEqual([]);

    // Phase 2 — incoming from menuItem B with the row from A now present.
    const fromA = existing({ id: 'a-row', menuItemId: 'A' });
    const phase2 = planIncomingMatch(
      [incoming({ menuItemId: 'B' })],
      [fromA],
    );
    // No menuItem-B match, fallback only allows unbound — A is tagged → create new
    expect(phase2.toCreate).toHaveLength(1);
    expect(phase2.toUpdate).toEqual([]);

    // Phase 3 — auto-merge groups the two tagged rows
    const fromB = existing({ id: 'b-row', menuItemId: 'B' });
    const groups = planAutoMerge([fromA, fromB]);
    expect(groups).toHaveLength(1);
    expect(groups[0].ids.sort()).toEqual(['a-row', 'b-row']);
  });
});

describe('Scenario 6 — extra edge cases', () => {
  it('hidden (mergedIntoId) and checked items are ignored when matching and merging', () => {
    const visible = existing({ id: 'v', quantity: 1 });
    const hidden = existing({ id: 'h', mergedIntoId: 'container' });
    const checked = existing({ id: 'c', isChecked: true });
    const plan = planIncomingMatch(
      [incoming({ quantity: 2 })],
      [visible, hidden, checked],
    );
    expect(plan.toUpdate).toEqual([{ id: 'v', quantity: 3, name: 'salt' }]);
    expect(planAutoMerge([visible, hidden, checked])).toEqual([]);
  });

  it('compatible volume units merge via combineQuantities', () => {
    const tsk = existing({ id: 'a', unit: 'tsk' });  // 1 tsk = 5 ml
    const msk = existing({ id: 'b', unit: 'msk' });  // 1 msk = 15 ml → total 20 ml = 1.33 msk
    const groups = planAutoMerge([tsk, msk]);
    expect(groups).toHaveLength(1);
    expect(groups[0].ids.sort()).toEqual(['a', 'b']);
    expect(groups[0].totalQty).toBe(1.33);
    expect(groups[0].unit).toBe('msk');
  });

  it('incompatible units (volume vs piece) do NOT merge', () => {
    const tsk = existing({ id: 'a', unit: 'tsk' });
    const st  = existing({ id: 'b', unit: 'st' });
    expect(planAutoMerge([tsk, st])).toEqual([]);
  });

  it('case-insensitive name and unit matching by default', () => {
    const e = existing({ id: 'e', name: 'Salt', unit: 'TSK' });
    const plan = planIncomingMatch(
      [incoming({ name: 'salt', unit: 'tsk' })],
      [e],
    );
    expect(plan.toUpdate).toEqual([{ id: 'e', quantity: 2, name: 'salt' }]);
  });

  it('two incoming rows targeting the same existing row sum correctly', () => {
    // Same menuItemId, same name+unit, two entries in batch
    const e = existing({ id: 'e', menuItemId: 'A', quantity: 1 });
    const plan = planIncomingMatch(
      [
        incoming({ menuItemId: 'A', quantity: 1 }),
        incoming({ menuItemId: 'A', quantity: 2 }),
      ],
      [e],
    );
    expect(plan.toUpdate).toEqual([{ id: 'e', quantity: 4, name: 'salt' }]);
    expect(plan.toCreate).toEqual([]);
  });

  it('uses normalize callback to collapse "klyftor vitlök" with "vitlök"', () => {
    const e = existing({ id: 'e', name: 'vitlök', unit: 'st', quantity: 1 });
    const normalize = (s: string) => s.toLowerCase().replace(/^.*\bvitlök$/, 'vitlök').trim();
    const plan = planIncomingMatch(
      [incoming({ name: 'klyftor vitlök', unit: 'st', quantity: 2 })],
      [e],
      normalize,
    );
    expect(plan.toUpdate).toEqual([{ id: 'e', quantity: 3, name: 'klyftor vitlök' }]);
  });
});

describe('Containers do not absorb incoming imports (regression)', () => {
  // Reported bug: an existing merge container (unbound, no menuItemId, has children)
  // was being treated as the unbound-fallback match, silently bumping its qty
  // when new ingredients were imported. Because the container itself has no
  // menuItemId, removing the source meal afterwards couldn't subtract the
  // contribution back out → eggs accumulated forever.
  it('skips unbound containers in fallback — creates new tagged item instead', () => {
    // List has a merge container "ägg 14 st" with 14 hidden leaves.
    const container = existing({ id: 'c', name: 'ägg', unit: 'st', quantity: 14, hasChildren: true });
    const plan = planIncomingMatch(
      [incoming({ name: 'ägg', unit: 'st', quantity: 3, menuItemId: 'pannkakor' })],
      [container],
    );
    // Container is NOT bumped. New leaf is created so it can be removed later.
    expect(plan.toUpdate).toEqual([]);
    expect(plan.toCreate).toEqual([
      { name: 'ägg', unit: 'st', quantity: 3, menuItemId: 'pannkakor' },
    ]);
  });

  it('still bumps a plain (non-container) unbound item', () => {
    const plain = existing({ id: 'p', name: 'ägg', unit: 'st', quantity: 1 });
    const plan = planIncomingMatch(
      [incoming({ name: 'ägg', unit: 'st', quantity: 2, menuItemId: 'A' })],
      [plain],
    );
    expect(plan.toUpdate).toEqual([{ id: 'p', quantity: 3, name: 'ägg' }]);
    expect(plan.toCreate).toEqual([]);
  });

  it('still matches existing tagged item with same menuItemId, ignoring container', () => {
    const container = existing({ id: 'c', name: 'ägg', unit: 'st', quantity: 14, hasChildren: true });
    const tagged = existing({ id: 't', name: 'ägg', unit: 'st', quantity: 2, menuItemId: 'A' });
    const plan = planIncomingMatch(
      [incoming({ name: 'ägg', unit: 'st', quantity: 1, menuItemId: 'A' })],
      [container, tagged],
    );
    expect(plan.toUpdate).toEqual([{ id: 't', quantity: 3, name: 'ägg' }]);
    expect(plan.toCreate).toEqual([]);
  });
});
