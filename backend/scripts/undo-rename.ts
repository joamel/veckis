/**
 * Ångrar ett namnbyte från adminsidan ("maizena redning" → "maizena") där de
 * två namnen visade sig vara olika varor.
 *
 *   npm run undo:rename -- "maizena redning" "maizena"            (torrkörning)
 *   npm run undo:rename -- "maizena redning" "maizena" --apply
 *
 * Ett omvänt namnbyte går inte: det flyttar ALLT som heter "maizena", även den
 * riktiga. Här flyttas bara poolens rader vars stavning bär de ord som skiljer
 * namnen åt ("redning") tillbaka. Basvarorna och en flyttad klassning går inte
 * att skilja från de riktiga i efterhand — de rapporteras, och rättas i appen
 * respektive på adminsidan.
 */
import { visaMåldatabas } from './visaDb';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({ log: ['error'] });

async function main() {
  visaMåldatabas();
  const args = process.argv.slice(2).filter(a => a !== '--apply');
  const apply = process.argv.includes('--apply');
  const [from, to] = args.map(a => a.trim().toLowerCase());
  if (!from || !to) {
    console.error('Användning: npm run undo:rename -- "<gamla namnet>" "<namnet det blev>" [--apply]');
    process.exitCode = 1;
    return;
  }

  const renames = await prisma.auditLog.findMany({
    where: { action: 'admin.rename_ingredient', targetName: { equals: from, mode: 'insensitive' } },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true, actorName: true, metadata: true },
  });
  console.log(`Namnbyten "${from}" i loggen: ${renames.length}`);
  for (const r of renames) console.log(`  ${r.createdAt.toISOString()}  ${r.actorName ?? ''}  ${JSON.stringify(r.metadata)}`);

  // Orden som skiljer namnen åt — "redning". Poolens stavningar som bär dem
  // var aldrig den andra varan.
  const toWords = new Set(to.split(/\s+/));
  const distinguishing = from.split(/\s+/).filter(w => !toWords.has(w));
  if (distinguishing.length === 0) {
    console.error(`\n"${from}" har inga ord som "${to}" saknar — kan inte skilja raderna åt.`);
    process.exitCode = 1;
    return;
  }
  const aliasRows = (await prisma.ingredientAlias.findMany({ where: { canonical: to }, select: { raw: true } }))
    .filter(a => distinguishing.every(w => a.raw.toLowerCase().includes(w)));
  console.log(`\nPoolen: ${aliasRows.length} stavningar pekar på "${to}" men innehåller "${distinguishing.join(' ')}":`);
  for (const a of aliasRows) console.log(`  ${a.raw}`);

  const staples = await prisma.stapleItem.findMany({ where: { name: to }, select: { householdId: true, usageCount: true } });
  console.log(`\nBasvaror som heter "${to}": ${staples.length} (kan vara riktiga — rättas i appen, se nedan)`);

  const curated = await prisma.curatedCategory.findMany({ where: { name: { in: [from, to] } } });
  console.log(`\nKlassningar på adminsidan: ${curated.length ? curated.map(c => `${c.name} → ${c.category}/${c.subCategory ?? '-'}`).join(', ') : 'inga'}`);

  // Hittas inget namnbyte gjordes ändringen någon annanstans — under en annan
  // stavning, som sammanslagning eller i appen. Visa allt som bär orden.
  if (renames.length === 0 || aliasRows.length === 0) {
    const word = distinguishing[0];
    const logged = (await prisma.auditLog.findMany({
      where: { targetType: 'ingredient' },
      orderBy: { createdAt: 'desc' }, take: 2000,
      select: { createdAt: true, action: true, targetName: true, metadata: true },
    })).filter(l => `${l.targetName ?? ''} ${JSON.stringify(l.metadata)}`.toLowerCase().includes(word)).slice(0, 20);
    console.log(`\nLoggrader som nämner "${word}": ${logged.length}`);
    for (const l of logged) console.log(`  ${l.createdAt.toISOString()}  ${l.action}  ${l.targetName ?? ''}  ${JSON.stringify(l.metadata)}`);
    const pool = await prisma.ingredientAlias.findMany({ where: { raw: { contains: word, mode: 'insensitive' } }, select: { raw: true, canonical: true } });
    console.log(`\nPoolens stavningar med "${word}": ${pool.length}`);
    for (const a of pool) console.log(`  ${a.raw} → ${a.canonical}`);
    const ownStaples = await prisma.stapleItem.findMany({ where: { name: { contains: word, mode: 'insensitive' } }, select: { name: true } });
    console.log(`\nBasvaror med "${word}": ${ownStaples.length ? ownStaples.map(s => s.name).join(', ') : 'inga'}`);
  }

  if (!apply) {
    console.log('\nTorrkörning. Kör igen med --apply för att flytta poolens rader tillbaka.');
    return;
  }
  const n = (await prisma.ingredientAlias.updateMany({ where: { raw: { in: aliasRows.map(a => a.raw) } }, data: { canonical: from } })).count;
  await prisma.auditLog.create({
    data: {
      householdId: null, actorClerkUserId: 'script:undo-rename', actorName: null, action: 'admin.undo_rename_ingredient',
      targetType: 'ingredient', targetId: from, targetName: from, metadata: { from, to, aliasRows: n },
    },
  });
  console.log(`\n${n} stavningar pekar nu på "${from}" igen.`);
}

main()
  .catch(err => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
