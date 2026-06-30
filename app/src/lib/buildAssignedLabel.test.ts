import { describe, it, expect } from 'vitest';
import { buildAssignedLabel } from './buildAssignedLabel';

const members = [
  { id: 'anna', displayName: 'Anna' },
  { id: 'bertil', displayName: 'Bertil' },
  { id: 'cesar', displayName: 'Cesar' },
];

const baseChore = {
  assignedTo: null as string | null,
  assignedToMany: [] as string[],
  rotation: false,
  completions: [] as unknown[],
};

describe('buildAssignedLabel', () => {
  it('returnerar null när ingen är tilldelad', () => {
    expect(buildAssignedLabel(baseChore, members)).toBe(null);
  });

  it('returnerar null om assignedTo-id inte finns bland members', () => {
    // Halv-orphaning: ID:t kvar men medlemmen borttagen. Säkrare att inte
    // visa något halvtomt än att rendera tom sträng.
    expect(buildAssignedLabel({ ...baseChore, assignedTo: 'ghost' }, members)).toBe(null);
  });

  it('visar enskild person via legacy assignedTo', () => {
    expect(buildAssignedLabel({ ...baseChore, assignedTo: 'anna' }, members)).toBe('Anna');
  });

  it('visar enskild person via assignedToMany', () => {
    expect(buildAssignedLabel({ ...baseChore, assignedToMany: ['bertil'] }, members)).toBe('Bertil');
  });

  it('föredrar assignedToMany framför assignedTo när båda finns', () => {
    expect(buildAssignedLabel({ ...baseChore, assignedTo: 'anna', assignedToMany: ['bertil'] }, members)).toBe('Bertil');
  });

  it('visar flera personer joined på " · " när rotation är av', () => {
    expect(buildAssignedLabel({ ...baseChore, assignedToMany: ['anna', 'bertil', 'cesar'] }, members)).toBe('Anna · Bertil · Cesar');
  });

  it('vid rotation med 2+ medlemmar: visar nuvarande turperson', () => {
    // completions.length = 0 → första tilldelade (anna) har turen
    const result = buildAssignedLabel(
      { ...baseChore, assignedToMany: ['anna', 'bertil'], rotation: true, completions: [] },
      members,
    );
    expect(result).toBe('Annas tur');
  });

  it('rotation cyklar efter completion', () => {
    // completions.length = 1 → tur har gått vidare till bertil
    const result = buildAssignedLabel(
      { ...baseChore, assignedToMany: ['anna', 'bertil'], rotation: true, completions: [{}] },
      members,
    );
    expect(result).toBe('Bertils tur');
  });

  it('rotation cyklar genom tre personer', () => {
    // Tre i rotation, en completion gjord → bertil
    const result = buildAssignedLabel(
      { ...baseChore, assignedToMany: ['anna', 'bertil', 'cesar'], rotation: true, completions: [{}] },
      members,
    );
    expect(result).toBe('Bertils tur');
  });

  it('rotation ignoreras med bara 1 medlem (falls back till joined names)', () => {
    expect(buildAssignedLabel(
      { ...baseChore, assignedToMany: ['anna'], rotation: true, completions: [] },
      members,
    )).toBe('Anna');
  });

  it('filtrerar bort borttagna medlemmar men behåller resten', () => {
    expect(buildAssignedLabel(
      { ...baseChore, assignedToMany: ['anna', 'ghost', 'bertil'] },
      members,
    )).toBe('Anna · Bertil');
  });

  it('returnerar null när alla tilldelade är borttagna', () => {
    expect(buildAssignedLabel(
      { ...baseChore, assignedToMany: ['ghost1', 'ghost2'] },
      members,
    )).toBe(null);
  });
});
