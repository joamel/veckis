/**
 * Städskript för hushållsdata. Två separata jobb, ett åt gången:
 *
 *   --orphans    HouseholdMember-rader vars clerkUserId inte längre finns i
 *                Clerk. Uppstår när konton raderats UTANFÖR appen (t.ex. från
 *                Clerk Dashboard) medan user.deleted-webhooken låg nere.
 *   --test-data  Hushåll där SAMTLIGA medlemmar är seed-/testanvändare.
 *
 * Torrkörning som standard — skriver bara ut vad som skulle röras. Lägg till
 * --apply för att faktiskt radera.
 *
 * OBS: till skillnad från prisma/seed.ts har det här skriptet med flit INGEN
 * "måste vara localhost"-spärr, eftersom det är skrivet för att köras mot
 * produktion. Skyddet ligger i stället i att torrkörning är default.
 */
import { PrismaClient } from '@prisma/client';
import { createClerkClient } from '@clerk/backend';
import { prisma as sharedPrisma } from '../src/db';
import { handleClerkUserDeleted } from '../src/lib/memberCleanup';

// Egen klient med error-only-loggning. Den delade i src/db loggar varje query
// när NODE_ENV=development, och då dränks rapporten som är hela poängen med en
// torrkörning. (handleClerkUserDeleted använder den delade internt — det är
// bara i --apply-läget, där lite extra loggning inte skadar.)
const prisma = new PrismaClient({ log: ['error'] });

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');

// Mönstren kommer från db:seed och gamla test-fixtures som kördes mot prod
// innan seed-spärren fanns.
const TEST_ID_PATTERNS = [/^clerk-\d+-\d+$/, /^testuser\d*$/, /^user_dev_placeholder$/];
const isTestUserId = (id: string) => TEST_ID_PATTERNS.some(re => re.test(id));

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} saknas i miljön — avbryter.`);
  return v;
}

/**
 * Ett raderat Clerk-konto ger 404. ALLT ANNAT (nätverksfel, 429, 5xx, ogiltig
 * nyckel) måste bubbla upp: tolkar vi ett tillfälligt fel som "kontot är borta"
 * raderar vi medlemskap för användare som lever. Hellre avbryta hela körningen.
 */
function isUserNotFound(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  return status === 404;
}

async function findOrphanUserIds(): Promise<string[]> {
  const rows = await prisma.householdMember.findMany({
    where: { clerkUserId: { not: null } },
    select: { clerkUserId: true },
    distinct: ['clerkUserId'],
  });
  // Testkontona har aldrig funnits i Clerk och skulle alltid ge 404 — de hör
  // till --test-data, inte hit.
  const ids = rows.map(r => r.clerkUserId!).filter(id => !isTestUserId(id));

  const clerk = createClerkClient({ secretKey: requireEnv('CLERK_SECRET_KEY') });
  const missing: string[] = [];
  for (const [i, id] of ids.entries()) {
    process.stdout.write(`\r  kollar mot Clerk: ${i + 1}/${ids.length}`);
    try {
      await clerk.users.getUser(id);
    } catch (err) {
      if (!isUserNotFound(err)) {
        throw new Error(`Uppslag av ${id} misslyckades (inte 404). Avbryter utan att radera något.`, { cause: err });
      }
      missing.push(id);
    }
  }
  process.stdout.write('\n');
  return missing;
}

async function runOrphans() {
  const missing = await findOrphanUserIds();
  if (missing.length === 0) {
    console.log('Inga föräldralösa medlemskap hittades.');
    return;
  }

  for (const id of missing) {
    const members = await prisma.householdMember.findMany({
      where: { clerkUserId: id },
      select: { displayName: true, role: true, household: { select: { name: true } } },
    });
    for (const m of members) {
      console.log(`  ${id}  ${m.displayName} (${m.role}) i "${m.household.name}"`);
    }
  }
  console.log(`\n${missing.length} raderade Clerk-konton med kvarvarande medlemskap.`);

  if (!APPLY) return;
  // handleClerkUserDeleted, inte en rå delete: var kontot ende admin befordras
  // äldsta kvarvarande medlem, annars låses hushållet för de som är kvar.
  let total = 0;
  for (const id of missing) {
    const removed = await handleClerkUserDeleted(id);
    total += removed.length;
  }
  console.log(`Raderade ${total} medlemskap.`);
}

async function runTestData() {
  const households = await prisma.household.findMany({
    include: { members: true, _count: { select: { shoppingLists: true, recipes: true } } },
  });

  // Bara hushåll där ALLA medlemmar är testkonton. Ett riktigt hushåll som råkar
  // ha en enstaka testmedlem ska inte raderas — då vore vi tillbaka i samma
  // sorts olycka som skapade skräpet från början.
  const junk = households.filter(h =>
    h.members.length > 0 && h.members.every(m => m.clerkUserId != null && isTestUserId(m.clerkUserId)),
  );
  const empty = households.filter(h => h.members.length === 0);

  for (const h of junk) {
    console.log(`  "${h.name}"  ${h.members.length} medlemmar, ${h._count.shoppingLists} listor, ${h._count.recipes} recept`);
  }
  console.log(`\n${junk.length} skräphushåll.`);
  if (empty.length > 0) {
    console.log(`${empty.length} hushåll saknar medlemmar helt — granskas separat, rörs inte av det här kommandot.`);
  }

  if (!APPLY) return;
  // Household-relationerna är onDelete: Cascade, så listor/recept/menyer följer med.
  const { count } = await prisma.household.deleteMany({ where: { id: { in: junk.map(h => h.id) } } });
  console.log(`Raderade ${count} hushåll.`);
}

async function main() {
  const wantsOrphans = args.has('--orphans');
  const wantsTestData = args.has('--test-data');
  if (wantsOrphans === wantsTestData) {
    console.error('Ange exakt ett av --orphans eller --test-data. Lägg till --apply för att radera på riktigt.');
    process.exit(1);
  }

  console.log(APPLY ? '*** SKARP KÖRNING — raderar på riktigt ***\n' : 'Torrkörning — inget raderas. Lägg till --apply för att köra skarpt.\n');
  if (wantsOrphans) await runOrphans();
  else await runTestData();
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await sharedPrisma.$disconnect(); });
