#!/usr/bin/env node
// Inspektera — och vid behov rensa — MFA på ett Clerk-konto.
//
// Finns för att ett konto kan bli utlåst av en MFA-registrering som INTE går
// att nå från något gränssnitt: Clerks användarportal döljer MFA-sektionen när
// funktionen inte ingår i planen, men en registrering som redan ligger på
// användarposten fortsätter att gälla vid inloggning. Då är backend-API:t enda
// vägen in, och det bryr sig varken om portalen eller planen.
//
// Användning (läser bara):
//   $env:CLERK_SECRET_KEY = "sk_..."
//   node scripts/clerk-mfa.mjs test@exempel.se
//
// Rensar ALLA MFA-metoder på kontot (kan inte ångras):
//   node scripts/clerk-mfa.mjs test@exempel.se --rensa
//
// OBS: nyckeln avgör vilken instans du träffar. sk_test = Development,
// sk_live = Production. Ett konto som bara finns i produktion syns inte med en
// testnyckel — det har förväxlats i det här projektet förr.

const API = 'https://api.clerk.com/v1';
const key = process.env.CLERK_SECRET_KEY;
const [epost, ...flaggor] = process.argv.slice(2);
const rensa = flaggor.includes('--rensa');

if (!key) {
  console.error('Saknar CLERK_SECRET_KEY i miljön.');
  process.exit(1);
}
if (!epost) {
  console.error('Användning: node scripts/clerk-mfa.mjs <e-post> [--rensa]');
  process.exit(1);
}

const instans = key.startsWith('sk_live') ? 'Production' : 'Development';

async function anropa(sokvag, metod = 'GET') {
  const res = await fetch(`${API}${sokvag}`, {
    method: metod,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${metod} ${sokvag} → ${res.status} ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

// Exakt träff på adressen, PLUS Clerks luddiga sökning. Den senare finns för
// att dubbletter sällan är exakta: samma person kan ha två konton där adresserna
// skiljer sig på punkter, plus-tillägg eller versaler, och då hittar
// email_address-frågan bara det ena. Två konton med "samma" adress men olika
// user-id är annars lätt att missa och förklarar motsägelsefulla symptom.
const exakta = await anropa(`/users?email_address=${encodeURIComponent(epost)}`);
const lokaldel = epost.split('@')[0].split('+')[0];
const luddiga = await anropa(`/users?query=${encodeURIComponent(lokaldel)}&limit=20`);

const alla = new Map();
for (const u of [...(exakta ?? []), ...(luddiga ?? [])]) alla.set(u.id, u);

if (alla.size === 0) {
  console.error(`Hittade ingen användare med ${epost} i instansen ${instans}.`);
  console.error('Är kontot kanske i den andra instansen? Byt nyckel i så fall.');
  process.exit(2);
}

if (alla.size > 1) {
  console.log(`\nOBS: ${alla.size} konton matchar "${lokaldel}" i ${instans}:`);
  for (const u of alla.values()) {
    const adresser = (u.email_addresses ?? []).map(e => e.email_address).join(', ');
    console.log(`  ${u.id} — ${adresser}`);
  }
  console.log('Är fler än ett tänkt att vara samma person är det en dubblett.');
}

// Bara den exakta adressen får detaljutskriften; de luddiga är till för att
// synliggöra dubbletter, inte för att rensas av misstag.
const users = (exakta ?? []).length > 0 ? exakta : [...alla.values()];

for (const u of users) {
  const telefonerForAndraSteg = (u.phone_numbers ?? [])
    .filter(p => p.reserved_for_second_factor)
    .map(p => p.phone_number);

  console.log(`\nInstans:            ${instans}`);
  console.log(`Användare:          ${u.id}`);
  console.log(`E-post:             ${epost}`);
  console.log(`two_factor_enabled: ${u.two_factor_enabled}`);
  console.log(`totp_enabled:       ${u.totp_enabled}`);
  console.log(`backup_code_enabled:${u.backup_code_enabled}`);
  console.log(`telefon som 2:a steg: ${telefonerForAndraSteg.join(', ') || '—'}`);
  console.log(`lösenord satt:      ${u.password_enabled}`);
  console.log(`användarnamn:       ${u.username ?? '—'}`);
  console.log(`utelåst (locked):   ${u.locked} (banned: ${u.banned})`);

  // Clerk slår upp inloggningen på IDENTIFIERARE, inte på användarposten. En
  // e-post som finns på kontot men inte duger som identifierare ger samma
  // "Couldn't find your account" som om kontot inte fanns alls — därför listas
  // adresserna med verifieringsstatus och vilken som är primär.
  console.log('\nE-postadresser på kontot:');
  for (const e of u.email_addresses ?? []) {
    const primar = e.id === u.primary_email_address_id ? ' [primär]' : '';
    console.log(`  ${e.email_address}${primar} — verifiering: ${e.verification?.status ?? 'ingen'}`);
  }

  if (!rensa) {
    console.log('\nLäsläge. Lägg till --rensa för att ta bort alla MFA-metoder.');
    continue;
  }
  await anropa(`/users/${u.id}/mfa`, 'DELETE');
  console.log('\nMFA rensad. Prova att logga in igen.');
}
