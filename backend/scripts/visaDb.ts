/**
 * Skriver ut VILKEN databas skriptet är kopplat till.
 *
 * Skripten här körs mot antingen den lokala databasen eller prod, och skillnaden
 * avgörs av en miljövariabel som är lätt att glömma: i PowerShell gäller
 * $env:DATABASE_URL bara i fönstret där den sattes, och utan den läses
 * backend/.env, alltså localhost. En körning mot fel databas ser likadan ut
 * som en mot rätt — den bara rapporterar andra siffror.
 *
 * Lösenordet skrivs aldrig ut.
 */
export function visaMåldatabas(): void {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log('DATABAS: (DATABASE_URL saknas — Prisma läser .env)\n');
    return;
  }

  try {
    const u = new URL(url);
    const lokal = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    console.log(`DATABAS: ${u.hostname}:${u.port || '5432'}${u.pathname}  ${lokal ? '← LOKAL' : '← FJÄRR (prod?)'}\n`);

    // Railways interna adress går bara att nå INIFRÅN deras nätverk. Kör man
    // ett skript från sin egen dator ger den bara "Can't reach database
    // server" plus en stacktrace, vilket inte säger något om orsaken.
    if (u.hostname.endsWith('.railway.internal')) {
      console.error('STOPP: det här är Railways INTERNA adress. Den går bara att nå från en tjänst inne i Railway,');
      console.error('       aldrig från din egen dator. Använd DATABASE_PUBLIC_URL i stället (Railway → Postgres →');
      console.error('       Variables). Saknas den är TCP-proxyn avstängd: slå på Public Networking på Postgres-');
      console.error('       tjänsten, kör skriptet, och stäng av den igen efteråt.\n');
      process.exit(1);
    }
  } catch {
    console.log('DATABAS: (kunde inte tolka DATABASE_URL)\n');
  }
}
