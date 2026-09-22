/**
 * Städar namn som bär med sig en mängd: "1/2 dl strösocker", "kg potatis",
 * "port ris", "förp".
 *
 * De kommer från receptimporter där mängden aldrig lyftes ur namnet, och de
 * blir egna rader vid sidan av den riktiga varan: "1/2 dl strösocker" delar
 * varken sökförslag eller kategori med "strösocker". Skiljer sig från
 * clean-junk-names, som tar rader där ingen vara går att rädda — här FINNS
 * varan, den har bara en mängd klistrad framför sig.
 *
 * Två tabeller:
 *  - stapleItem: basvaran byter namn. Finns den riktiga varan redan i samma
 *    hushåll slås de ihop i stället (usageCount läggs samman), annars hade
 *    namnbytet krockat med unik-indexet householdId+name.
 *  - ingredientAlias: nyckeln (raw) är en cache-nyckel som dagens strippning
 *    aldrig kan producera igen, så raden är oåtkomlig. Nyckeln FLYTTAS till
 *    den form strippningen ger i dag — raden bär ett kanoniskt namn som kan
 *    vara enda stället varan finns i den globala poolen. Radering bara när
 *    målnyckeln redan är upptagen, alltså när raden är en dubblett.
 *
 * Körningen går att göra om: en avbruten körning fortsätter utan att klaga på
 * rader som redan är åtgärdade.
 *
 * Torrkörning som standard — skriver bara ut vad som skulle hända. --apply för
 * att faktiskt skriva. Kör mot produktion genom att peka DATABASE_URL dit.
 */
import { PrismaClient } from '@prisma/client';
import { visaMåldatabas } from './visaDb';
import { skrivGranskningsfil, läsGranskningsfil, lägeskontroll, type Granskningsrad } from './granskningsfil';
import { stadaMangdprefix } from '../src/lib/mangdprefix';

const prisma = new PrismaClient({ log: ['error'] });

const argv = process.argv.slice(2);
const args = new Set(argv);
const APPLY = args.has('--apply');
function flaggvärde(namn: string): string | null {
  const i = argv.indexOf(namn);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
}
const SKRIV_FIL = flaggvärde('--fil');
const LÄS_FIL = flaggvärde('--från-fil');

async function main() {
  visaMåldatabas();
  lägeskontroll({ skrivFil: SKRIV_FIL, läsFil: LÄS_FIL, apply: APPLY });

  const staples = await prisma.stapleItem.findMany({
    select: { id: true, name: true, householdId: true, usageCount: true },
  });
  const alias = await prisma.ingredientAlias.findMany({ select: { raw: true, canonical: true } });

  // Namn per hushåll, för att se om målet redan finns (då blir det ihopslagning).
  const perHushåll = new Map<string, Map<string, { id: string; usageCount: number }>>();
  for (const s of staples) {
    const karta = perHushåll.get(s.householdId) ?? new Map();
    karta.set(s.name.toLowerCase(), { id: s.id, usageCount: s.usageCount });
    perHushåll.set(s.householdId, karta);
  }

  const förslag: Granskningsrad[] = [];
  for (const s of staples) {
    const beslut = stadaMangdprefix(s.name);
    if (beslut.åtgärd === 'behåll') continue;
    if (beslut.åtgärd === 'radera') {
      förslag.push({ tabell: 'staple', nyckel: s.id, namn: s.name, till: `RADERAS (${beslut.varför})` });
      continue;
    }
    const finns = perHushåll.get(s.householdId)?.get(beslut.till);
    förslag.push({
      tabell: 'staple',
      nyckel: s.id,
      namn: s.name,
      till: finns && finns.id !== s.id ? `SLÅS IHOP med "${beslut.till}"` : `BYTER NAMN till "${beslut.till}"`,
    });
  }
  // Alias-nyckeln (raw) är den strippade formen. Börjar den med en mängd kan
  // dagens strippning aldrig producera den igen, så raden är oåtkomlig.
  //
  // Men RADERA den inte: nyckeln bär ett kanoniskt namn som kan vara det enda
  // stället där varan finns i den globala poolen (burrata, pecorino,
  // citronskal). Nyckeln FLYTTAS till den form strippningen ger i dag, så
  // både cachen och sökförslaget blir kvar. Bara när målnyckeln redan är
  // upptagen är raden en dubblett och kan tas bort.
  const aliasNycklar = new Set(alias.map(a => a.raw));
  for (const a of alias) {
    const beslut = stadaMangdprefix(a.raw);
    if (beslut.åtgärd === 'behåll') continue;
    if (beslut.åtgärd === 'radera' || aliasNycklar.has(beslut.till)) {
      const varför = beslut.åtgärd === 'radera' ? beslut.varför : 'nyckeln finns redan';
      förslag.push({ tabell: 'alias', nyckel: a.raw, namn: `${a.raw} → ${a.canonical}`, till: `RADERAS (${varför})` });
      continue;
    }
    förslag.push({
      tabell: 'alias',
      nyckel: a.raw,
      namn: `${a.raw} → ${a.canonical}`,
      till: `NYCKELN FLYTTAS till "${beslut.till}"`,
    });
  }

  console.log(`${staples.length} basvaror och ${alias.length} aliasrader genomsökta.`);
  console.log(`${förslag.length} rader har en mängd i namnet.\n`);
  for (const f of förslag.slice(0, 30)) console.log(`   - ${f.namn.slice(0, 60).padEnd(60)} ${f.till}`);
  if (förslag.length > 30) console.log(`   ... och ${förslag.length - 30} till.`);

  if (förslag.length === 0) {
    console.log('\nInget att göra.');
    return;
  }

  if (SKRIV_FIL) {
    skrivGranskningsfil(SKRIV_FIL, förslag);
    return;
  }

  if (!APPLY) {
    console.log('\nTorrkörning. Inget skrevs.');
    console.log('  --fil <sökväg>   skriver ALLA förslag till en textfil du granskar i Anteckningar');
    console.log('  --apply          genomför allt ovan direkt (utan granskning)');
    return;
  }

  const attGöra = LÄS_FIL ? läsGranskningsfil(LÄS_FIL) : förslag;
  let bytta = 0, ihopslagna = 0, raderade = 0, flyttade = 0;

  for (const f of attGöra) {
    if (f.tabell === 'alias') {
      const beslut = stadaMangdprefix(f.nyckel);
      if (beslut.åtgärd === 'byt' && !aliasNycklar.has(beslut.till)) {
        const flyttat = await prisma.ingredientAlias.updateMany({ where: { raw: f.nyckel }, data: { raw: beslut.till } });
        if (flyttat.count === 0) continue; // redan flyttad i en tidigare körning
        // Hushållsraderna pekar på nyckeln och måste följa med, annars tappar
        // aliaset sin koppling till hushållen och göms av globala tröskeln.
        await prisma.ingredientAliasHousehold.updateMany({ where: { raw: f.nyckel }, data: { raw: beslut.till } });
        aliasNycklar.add(beslut.till);
        aliasNycklar.delete(f.nyckel);
        flyttade++;
        continue;
      }
      // deleteMany, inte delete: en rad som redan är borta ska inte logga ett
      // fel. Samma fil kan köras om — en avbruten körning måste gå att
      // fortsätta utan att skriptet låter som om något gått sönder.
      const bort = await prisma.ingredientAlias.deleteMany({ where: { raw: f.nyckel } });
      await prisma.ingredientAliasHousehold.deleteMany({ where: { raw: f.nyckel } });
      raderade += bort.count;
      continue;
    }
    const s = staples.find(x => x.id === f.nyckel);
    if (!s) continue;
    const beslut = stadaMangdprefix(s.name);
    if (beslut.åtgärd === 'radera') {
      const bort = await prisma.stapleItem.deleteMany({ where: { id: s.id } });
      raderade += bort.count;
      continue;
    }
    if (beslut.åtgärd !== 'byt') continue;

    const finns = perHushåll.get(s.householdId)?.get(beslut.till);
    if (finns && finns.id !== s.id) {
      // Ihopslagning: den riktiga varan ärver användningarna, så "mest
      // använda"-listan inte tappar historiken.
      await prisma.stapleItem.updateMany({
        where: { id: finns.id },
        data: { usageCount: { increment: s.usageCount } },
      });
      const bort = await prisma.stapleItem.deleteMany({ where: { id: s.id } });
      ihopslagna += bort.count;
    } else {
      const ändrade = await prisma.stapleItem.updateMany({ where: { id: s.id }, data: { name: beslut.till } });
      perHushåll.get(s.householdId)?.set(beslut.till, { id: s.id, usageCount: s.usageCount });
      bytta += ändrade.count;
    }
  }

  console.log(`\nKLART: ${bytta} namnbyten, ${ihopslagna} ihopslagna, ${flyttade} flyttade nycklar, ${raderade} raderade.`);
}

main()
  .catch(e => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
