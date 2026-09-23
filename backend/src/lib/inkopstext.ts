import { parseItemLine } from '@veckis/shared';
import { delaOch } from './alternativ';

export type TolkadVara = {
  name: string;
  quantity: number | null;
  unit: string | null;
  /** Hur många rader varan stod på. >1 visas i granskningen — utan mängd går
   *  det inte att veta HUR mycket mer som behövs, bara att den stod flera
   *  gånger (ofta två recept med samma vara). */
  antalRader?: number;
};

/** Tak per import — en inklistrad roman ska inte bli tusen varor. Nåddes av
 *  en riktig lista på 510 rader, så det höjdes; når man taket säger svaret
 *  till i stället för att tyst kapa. */
export const MAX_VAROR = 400;

// Punktlistor, kryssrutor och numrering som andra listappar sätter framför
// raden: "- mjölk", "• mjölk", "[ ] mjölk", "☐ mjölk", "❏ mjölk", "1. mjölk".
// Numreringen kräver punkt eller parentes — "2 mjölk" är en mängd, inte ett
// radnummer.
const PREFIX_RE = /^\s*(?:[-*•·–—+>]+|\[\s*[xX✓✔]?\s*\]|[☐☑☒✓✔❏❑❒▢□▪▫■●○]|\d+[.)](?=\s))\s*/u;

// Rubrikrad: slutar med kolon ("Mejeri:") eller med en stjärna, som listappar
// sätter på avdelningar och recept ("Frukt och grönt ✭"). Utan det blev varje
// avdelning och varje rättnamn en egen "vara".
const RUBRIK_RE = /(?::|[✭★☆✩✪⭐])\s*$/u;

// Beskrivningar som hamnar EFTER ett komma hör till varan före, inte till en
// egen vara: "soja, glutenfri" är en vara, inte soja plus glutenfri.
const BESKRIVNING_RE = /^(?:(?:gluten|lakt(?:os)?|socker|salt)fri(?:a|tt)?|eko(?:logisk[at]?|logiska)?|färsk[at]?|frysta?|torkad[e]?|malen|malet|riven|rivna|hackad[e]?|skivad[e]?|naturell|osaltad|saltad|smaksatt)$/u;

/**
 * En inklistrad lista → varor. Varje rad är en vara; en rad med kommatecken
 * följda av mellanslag ("mjölk, bröd, ägg") delas också, men inte ett
 * decimalkomma ("1,5 l mjölk"). Rubriker ("Mejeri:", "Frukt och grönt ✭") och
 * tomma rader hoppas över. Mängd läses både före ("2 l mjölk") och efter
 * namnet ("mjölk 2 l", "ägg x12"). Ingen AI — texten är redan text.
 */
export function tolkaInköpstext(text: string): TolkadVara[] {
  return tolkaInköpslista(text).varor;
}

/** Som ovan, men säger också om taket nåddes. */
export function tolkaInköpslista(text: string): { varor: TolkadVara[]; kapad: boolean } {
  const delar = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .flatMap(rad => rad.split(/;|,\s+/));

  // Hopslagningen sker LÖPANDE, inte efteråt: taket ska räkna färdiga varor.
  // Räknades det på rader kapades en lista på 490 rader vid 400 — fast den
  // bara gav 354 varor — och de sista recepten föll bort utan orsak.
  const sedda = new Map<string, TolkadVara>();
  const varor: TolkadVara[] = [];
  let kapad = false;
  let senaste: TolkadVara | null = null;
  for (const rå of delar) {
    let rad = rå.trim();
    // Prefixen kan vara flera ("- [ ] mjölk").
    for (let i = 0; i < 3; i++) rad = rad.replace(PREFIX_RE, '');
    rad = rad.replace(/[.,;:!]+$/u, '').trim();
    if (!rad || RUBRIK_RE.test(rå.trim())) continue;
    if (!/\p{L}/u.test(rad)) continue; // bara siffror/tecken

    // "soja, glutenfri" → beskrivningen sätts tillbaka på varan före. Varan
    // FRÅN FÖREGÅENDE RAD, inte sista unika raden: stod varan redan tidigare
    // i listan hamnade beskrivningen annars på fel vara.
    if (BESKRIVNING_RE.test(rad.toLowerCase()) && senaste) {
      senaste.name = `${senaste.name} ${rad.toLowerCase()}`;
      continue;
    }

    // "gurka och tomat" är två varor: "och" betyder att man behöver båda.
    // "eller" och snedstreck delas däremot ALDRIG i listan — valet mellan lax
    // och torsk tillhör den som står i butiken, så raden behåller hela texten.
    // delaOch är försiktig: båda sidor måste kännas igen som riktiga varor, så
    // "kött- och grillkrydda" hålls ihop (se alternativ.ts).
    for (const del of delaOch(rad) ?? [rad]) {
      const lagd = läggTill(parseItemLine(del));
      senaste = lagd.vara;
      if (lagd.fullt) { kapad = true; break; }
    }
    if (kapad) break;
  }

  /**
   * Samma vara flera gånger:
   *  - MED mängd summeras den ("2 l mjölk" två gånger blir 4 l — ofta två
   *    recept som båda behöver sin liter).
   *  - UTAN mängd blir det en rad, med antalet rader sparat. Att summera till
   *    "2 ägg" vore en påhittad siffra: står ägg i två recept är två ägg
   *    nästan säkert fel. Granskningen säger "står 2 gånger" i stället, så
   *    valet blir användarens.
   *
   * Returnerar raden som varan hamnade i (samma som förut om den fanns) och
   * om taket är nått.
   */
  function läggTill(v: TolkadVara): { vara: TolkadVara; fullt: boolean } {
    const nyckel = `${v.name.toLowerCase()}|${v.unit ?? ''}`;
    const fanns = sedda.get(nyckel);
    if (fanns) {
      fanns.antalRader = (fanns.antalRader ?? 1) + 1;
      if (v.quantity !== null) fanns.quantity = (fanns.quantity ?? 1) + v.quantity;
      return { vara: fanns, fullt: false };
    }
    const ny = { ...v, antalRader: 1 };
    sedda.set(nyckel, ny);
    varor.push(ny);
    return { vara: ny, fullt: varor.length >= MAX_VAROR };
  }

  return { varor, kapad };
}

/**
 * En enda rad → namn, mängd och enhet, för det manuella fältet. Tunn genväg
 * till den delade tolkningen; appen anropar samma funktion direkt.
 */
export function tolkaEnRad(text: string): TolkadVara {
  return parseItemLine(text);
}

