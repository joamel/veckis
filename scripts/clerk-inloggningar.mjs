#!/usr/bin/env node
// Visa inloggningshistoriken för ett Clerk-konto: lyckades någon ta sig in,
// och i så fall när och varifrån?
//
// Finns för att e-postkoder som skickas ut inte säger någonting om utfallet.
// En kod betyder bara att NÅGON angav adressen — inte att de kom in. När
// Play-granskaren fastnade gick det inte att avgöra från utsidan om ett av
// försöken faktiskt lyckades, och den skillnaden är hela skillnaden mellan
// "granskningen kom igång" och "ingen har varit inne på kontot".
//
// Användning (läser bara, ändrar ingenting):
//   $env:CLERK_SECRET_KEY = "sk_live_..."
//   node scripts/clerk-inloggningar.mjs joamelander+review@gmail.com
//
// OBS: nyckeln avgör vilken instans du träffar. sk_test = Development,
// sk_live = Production. Ett konto som bara finns i produktion syns inte med
// en testnyckel — det har förväxlats i det här projektet förr.

const API = 'https://api.clerk.com/v1';
const key = process.env.CLERK_SECRET_KEY;
const [epost] = process.argv.slice(2);

if (!key) {
  console.error('Saknar CLERK_SECRET_KEY i miljön.');
  process.exit(1);
}
if (!epost) {
  console.error('Användning: node scripts/clerk-inloggningar.mjs <e-post>');
  process.exit(1);
}

const instans = key.startsWith('sk_live') ? 'Production' : 'Development';

async function anropa(sokvag) {
  const res = await fetch(`${API}${sokvag}`, {
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText} — ${text.slice(0, 300)}`);
  }
  return res.json();
}

function tid(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  const minuterSedan = Math.round((Date.now() - ms) / 60000);
  const sedan = minuterSedan < 60
    ? `${minuterSedan} min sedan`
    : `${Math.round(minuterSedan / 60)} h sedan`;
  return `${d.toLocaleString('sv-SE')} (${sedan})`;
}

const huvud = (t) => console.log(`\n${t}\n${'─'.repeat(t.length)}`);

try {
  console.log(`Instans:            ${instans}`);

  const träffar = await anropa(`/users?email_address=${encodeURIComponent(epost)}`);
  const användare = Array.isArray(träffar) ? träffar : träffar?.data ?? [];
  if (användare.length === 0) {
    console.error(`\nHittade ingen användare med ${epost} i ${instans}.`);
    process.exit(2);
  }
  if (användare.length > 1) {
    console.log(`OBS: ${användare.length} konton delar adressen — visar alla.`);
  }

  for (const u of användare) {
    huvud(`Användare ${u.id}`);
    console.log(`E-post:             ${epost}`);
    console.log(`Skapad:             ${tid(u.created_at)}`);
    // Det här är frågan: har någon NÅGONSIN kommit in, och när senast?
    console.log(`Senaste inloggning: ${tid(u.last_sign_in_at)}`);
    console.log(`Senast aktiv:       ${tid(u.last_active_at)}`);
    console.log(`Utelåst:            ${u.locked ? 'JA' : 'nej'} (banned: ${u.banned ? 'JA' : 'nej'})`);
    if (u.lockout_expires_in_seconds) {
      console.log(`Låset släpper om:   ${Math.round(u.lockout_expires_in_seconds / 60)} min`);
    }
    if (typeof u.verification_attempts_remaining === 'number') {
      console.log(`Försök kvar:        ${u.verification_attempts_remaining}`);
    }

    // Sessioner visar de inloggningar som faktiskt gick igenom. En session
    // som aldrig skapats betyder att försöket stannade vid koden.
    const sessioner = await anropa(`/sessions?user_id=${encodeURIComponent(u.id)}&limit=20`);
    const lista = Array.isArray(sessioner) ? sessioner : sessioner?.data ?? [];

    huvud(`Sessioner (${lista.length})`);
    if (lista.length === 0) {
      console.log('Inga sessioner alls — ingen har kommit in på kontot.');
    }
    for (const s of lista) {
      console.log(`  ${s.status.padEnd(10)} skapad ${tid(s.created_at)}`);
      console.log(`  ${''.padEnd(10)} senast aktiv ${tid(s.last_active_at)}`);
      if (s.latest_activity) {
        const a = s.latest_activity;
        const plats = [a.city, a.country].filter(Boolean).join(', ') || '—';
        console.log(`  ${''.padEnd(10)} ${plats} · IP ${a.ip_address ?? '—'}`);
        console.log(`  ${''.padEnd(10)} ${a.browser_name ?? '?'} ${a.browser_version ?? ''} · ${a.device_type ?? '?'} ${a.is_mobile ? '(mobil)' : ''}`);
      }
      console.log('');
    }
  }
} catch (e) {
  console.error(`\nFel: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
