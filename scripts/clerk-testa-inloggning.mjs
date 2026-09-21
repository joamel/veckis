#!/usr/bin/env node
// Kör granskarens lösenordsinloggning på riktigt och rapportera vad Clerk
// svarar: blev den klar direkt, eller krävs ett andra steg?
//
// Finns för att frågan "måste man klicka i ett mejl för att komma in?" inte
// går att resonera sig fram till. Kontots inställningar säger att MFA är av,
// men appen har ändå kod för ett andra steg (sign-in.tsx) eftersom Clerk KAN
// kräva det. Det enda som avgör saken är att göra försöket och läsa statusen.
//
// Anropar Clerks frontend-API — exakt samma väg som appen tar — inte
// backend-API:t, som kringgår hela inloggningslogiken och därför inte skulle
// bevisa någonting.
//
// Användning:
//   $env:REVIEW_EPOST = "joamelander+review@gmail.com"
//   $env:REVIEW_LOSENORD = "..."
//   node scripts/clerk-testa-inloggning.mjs
//
// Lösenordet läses ur miljön med flit — det ska inte hamna i skalhistoriken.
//
// Testet SKAPAR en session om inloggningen lyckas. Sätt CLERK_SECRET_KEY
// (sk_live) så avslutas den automatiskt efteråt, så att det inte ser ut som
// en främmande inloggning i historiken.

const FAPI = 'https://clerk.handlis.app';
const epost = process.env.REVIEW_EPOST;
const losenord = process.env.REVIEW_LOSENORD;
const secret = process.env.CLERK_SECRET_KEY;

if (!epost || !losenord) {
  console.error('Sätt REVIEW_EPOST och REVIEW_LOSENORD i miljön.');
  process.exit(1);
}

// Clerks frontend-API vill ha en klient-kontext. Utan den svarar den med
// fel som handlar om begäran i stället för om inloggningen.
const gemensamma = {
  'Content-Type': 'application/x-www-form-urlencoded',
  Origin: FAPI,
};

async function fapi(sokvag, kropp, devSession) {
  const url = new URL(`${FAPI}/v1${sokvag}`);
  url.searchParams.set('_clerk_js_version', '5.0.0');
  if (devSession) url.searchParams.set('__clerk_db_jwt', devSession);
  const res = await fetch(url, {
    method: 'POST',
    headers: gemensamma,
    body: new URLSearchParams(kropp).toString(),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, json, text };
}

function beskrivStatus(s) {
  switch (s) {
    case 'complete': return 'KLAR — inloggad direkt, inget andra steg.';
    case 'needs_second_factor': return 'ANDRA STEG KRÄVS — hit kommer granskaren inte.';
    case 'needs_first_factor': return 'Lösenordet räckte inte som första steg.';
    case 'needs_identifier': return 'Clerk kände inte igen identifieraren.';
    default: return `Okänd status: ${s}`;
  }
}

// Ett platsberoende krav skulle synas som en inställning på instansen, inte
// på kontot. Läses bara om nyckeln finns; utan den hoppas kontrollen över.
async function visaInstansinstallningar() {
  if (!secret) return;
  const res = await fetch('https://api.clerk.com/v1/instance', {
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (!res.ok) {
    console.log(`Instansinställningar: kunde inte läsas (${res.status}) — hoppar över.`);
    return;
  }
  const i = await res.json();
  console.log('Instansinställningar:');
  for (const nyckel of ['enhanced_email_deliverability', 'test_mode', 'hibp', 'allowed_origins']) {
    if (i?.[nyckel] !== undefined) console.log(`  ${nyckel}: ${JSON.stringify(i[nyckel])}`);
  }
  console.log('');
}

try {
  console.log(`Frontend-API:       ${FAPI}`);
  console.log(`Identifierare:      ${epost}`);
  console.log('');
  await visaInstansinstallningar();
  console.log('Utför lösenordsinloggning …\n');

  const svar = await fapi('/client/sign_ins', {
    identifier: epost,
    strategy: 'password',
    password: losenord,
  });

  if (svar.json?.errors?.length) {
    console.log('Clerk svarade med fel:');
    for (const f of svar.json.errors) {
      console.log(`  ${f.code}: ${f.long_message ?? f.message}`);
    }
    process.exit(2);
  }

  const r = svar.json?.response ?? svar.json;
  const status = r?.status;
  console.log(`Status:             ${status}`);
  console.log(`Betyder:            ${beskrivStatus(status)}`);

  const andra = r?.supported_second_factors ?? [];
  console.log(`Andra steg som Clerk erbjuder: ${andra.length ? andra.map(f => f.strategy).join(', ') : 'inga'}`);

  if (status === 'complete') {
    console.log('\nSlutsats: lösenordet ensamt räcker. Inget mejl behöver öppnas,');
    console.log('ingen kod behöver läsas. Granskaren kommer in om hen hittar');
    console.log('lösenordsvägen — vilket var det som saknades.');
  }

  // Städa bort sessionen testet skapade.
  const sessionId = r?.created_session_id;
  if (sessionId && secret) {
    const res = await fetch(`https://api.clerk.com/v1/sessions/${sessionId}/revoke`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    });
    console.log(`\nTestsessionen ${sessionId}: ${res.ok ? 'avslutad' : `kunde inte avslutas (${res.status})`}`);
  } else if (sessionId) {
    console.log(`\nOBS: testet skapade sessionen ${sessionId}. Sätt CLERK_SECRET_KEY`);
    console.log('så avslutas den automatiskt, annars ligger den kvar i historiken.');
  }
} catch (e) {
  console.error(`\nFel: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
