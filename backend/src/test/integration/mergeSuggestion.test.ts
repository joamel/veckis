// Integration: smart merge-agent — UnitEquivalence-kunskap + suggestMerge
// end-to-end mot DB, samt inlärningsregeln learnEquivalenceFromMerge.
// AI är naturligt avstängd (ingen ANTHROPIC_API_KEY i .env.test) så
// resolveEquivalences blir cache-only här.

import { describe, it, expect } from 'vitest';
import { prisma } from '../../db';
import {
  suggestMerge,
  loadEquivalences,
  resolveEquivalences,
  learnEquivalenceFromMerge,
} from '../../lib/smartMerge';

async function seedEquivalence(over: Partial<{ name: string; unit: string; baseAmount: number; baseUnit: string; source: string; seenCount: number }> = {}) {
  return prisma.unitEquivalence.create({
    data: {
      name: 'krossade tomater',
      unit: 'paket',
      baseAmount: 400,
      baseUnit: 'g',
      source: 'ai',
      seenCount: 1,
      ...over,
    },
  });
}

const tomatoSources = [
  { name: 'krossade tomater', quantity: 1, unit: 'paket' },
  { name: 'krossade tomater', quantity: 390, unit: 'g' },
];

describe('resolveEquivalences + suggestMerge (end-to-end mot DB)', () => {
  it('seedad ekvivalens → 1 paket + 390 g föreslås som 2 paket', async () => {
    await seedEquivalence();
    const eq = await resolveEquivalences(['krossade tomater'], ['paket']);
    const s = suggestMerge([{ quantity: 1, unit: 'paket' }, { quantity: 390, unit: 'g' }], eq);
    expect(s).toEqual({ quantity: 2, unit: 'paket', basis: 'equivalence' });
  });

  it('okänd vara utan API-nyckel → tom map → null', async () => {
    const eq = await resolveEquivalences(['okänd exotisk vara'], ['paket']);
    expect(eq.size).toBe(0);
    const s = suggestMerge([{ quantity: 1, unit: 'paket' }, { quantity: 390, unit: 'g' }], eq);
    expect(s).toBeNull();
  });

  it('stale rad (seenCount 0) ignoreras av loadEquivalences', async () => {
    await seedEquivalence({ seenCount: 0 });
    const eq = await loadEquivalences(['krossade tomater']);
    expect(eq.size).toBe(0);
  });

  it('confirmedOnly: ai/seenCount 1 exkluderas, user/seed/seenCount 2 inkluderas', async () => {
    await seedEquivalence(); // ai, seenCount 1
    await seedEquivalence({ name: 'smör', source: 'user' });
    await seedEquivalence({ name: 'kokosmjölk', unit: 'burk', baseUnit: 'ml', source: 'seed' });
    await seedEquivalence({ name: 'bacon', source: 'ai', seenCount: 2 });

    expect((await loadEquivalences(['krossade tomater'], { confirmedOnly: true })).size).toBe(0);
    expect((await loadEquivalences(['smör'], { confirmedOnly: true })).size).toBe(1);
    expect((await loadEquivalences(['kokosmjölk'], { confirmedOnly: true })).size).toBe(1);
    expect((await loadEquivalences(['bacon'], { confirmedOnly: true })).size).toBe(1);
  });
});

describe('learnEquivalenceFromMerge', () => {
  it('bekräftande merge promotar: seenCount 1→2, source ai→user', async () => {
    const row = await seedEquivalence();
    await learnEquivalenceFromMerge(
      tomatoSources,
      { name: 'krossade tomater', quantity: 2, unit: 'paket' }, // = förslaget
      ['krossade tomater'],
    );
    const after = await prisma.unitEquivalence.findUnique({ where: { id: row.id } });
    expect(after!.seenCount).toBe(2);
    expect(after!.source).toBe('user');
  });

  it('avvikande mängd demotar ai-rad: seenCount 1→0', async () => {
    const row = await seedEquivalence();
    await learnEquivalenceFromMerge(
      tomatoSources,
      { name: 'krossade tomater', quantity: 3, unit: 'paket' }, // ≠ förslaget (2)
      ['krossade tomater'],
    );
    const after = await prisma.unitEquivalence.findUnique({ where: { id: row.id } });
    expect(after!.seenCount).toBe(0);
    expect(after!.source).toBe('ai');
  });

  it('user-rad demotas aldrig vid avvikelse', async () => {
    const row = await seedEquivalence({ source: 'user', seenCount: 3 });
    await learnEquivalenceFromMerge(
      tomatoSources,
      { name: 'krossade tomater', quantity: 5, unit: 'paket' },
      ['krossade tomater'],
    );
    const after = await prisma.unitEquivalence.findUnique({ where: { id: row.id } });
    expect(after!.seenCount).toBe(3);
    expect(after!.source).toBe('user');
  });

  it('no-op: icke-heltalsmängd', async () => {
    const row = await seedEquivalence();
    await learnEquivalenceFromMerge(
      tomatoSources,
      { name: 'krossade tomater', quantity: 1.5, unit: 'paket' },
      ['krossade tomater'],
    );
    const after = await prisma.unitEquivalence.findUnique({ where: { id: row.id } });
    expect(after!.seenCount).toBe(1);
  });

  it('no-op: final-enhet är g/ml (ingen förpackningsenhet)', async () => {
    const row = await seedEquivalence();
    await learnEquivalenceFromMerge(
      tomatoSources,
      { name: 'krossade tomater', quantity: 790, unit: 'g' },
      ['krossade tomater'],
    );
    const after = await prisma.unitEquivalence.findUnique({ where: { id: row.id } });
    expect(after!.seenCount).toBe(1);
    expect(after!.source).toBe('ai');
  });

  it('no-op: ingen ekvivalensrad finns för varan', async () => {
    await learnEquivalenceFromMerge(
      [{ name: 'mystisk vara', quantity: 1, unit: 'paket' }, { name: 'mystisk vara', quantity: 100, unit: 'g' }],
      { name: 'mystisk vara', quantity: 2, unit: 'paket' },
      ['mystisk vara'],
    );
    expect(await prisma.unitEquivalence.count()).toBe(0);
  });

  it('no-op: sources saknar lös g/ml-rad (bara förpackningar)', async () => {
    const row = await seedEquivalence();
    await learnEquivalenceFromMerge(
      [
        { name: 'krossade tomater', quantity: 1, unit: 'paket' },
        { name: 'krossade tomater', quantity: 1, unit: 'paket' },
      ],
      { name: 'krossade tomater', quantity: 2, unit: 'paket' },
      ['krossade tomater'],
    );
    const after = await prisma.unitEquivalence.findUnique({ where: { id: row.id } });
    expect(after!.seenCount).toBe(1);
    expect(after!.source).toBe('ai');
  });
});
