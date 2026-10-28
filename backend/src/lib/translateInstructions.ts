import Anthropic from '@anthropic-ai/sdk';
import { convertUnitsInText } from './instructionUnits';
import { textUr } from './aiJson';
import { bokförAiKostnad } from './aiCost';

/**
 * Översätter tillagningsstegen till svenska vid import.
 *
 * Ingrediensnamnen har översatts sedan tidigare, men stegen lämnades — så ett
 * importerat recept hade svenska ingredienser och engelsk tillagning, med
 * "400°F" och "2 cups" mitt i texten.
 *
 * Talen räknas INTE om av modellen. Den översätter orden; mått och
 * temperaturer byts efteråt av instructionUnits.ts, som är regelstyrd och
 * testad. En modell som räknar om grader i förbifarten gör fel som ser
 * rimliga ut.
 */

const MODELL = 'claude-haiku-4-5-20251001';

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const SYSTEM_PROMPT = `Du översätter tillagningsanvisningar från engelska till svenska för ett recept.

Regler:
- Behåll ALLA rader och deras ordning. Ett steg per rad, precis som i indata.
- Behåll numreringen om den finns ("1. ", "2. ").
- Rör INTE siffror, mängder, enheter eller temperaturer — de räknas om separat.
  "Bake at 400°F for 20 minutes" blir "Grädda i 400°F i 20 minuter".
- Översätt matlagningsverb och redskap till vanlig svensk receptsvenska:
  fold → vänd ner, whisk → vispa, simmer → sjud, skillet → stekpanna.
- Lägg inte till något, förklara inget, hitta inte på steg.
- Svara ENBART med den översatta texten. Ingen kommentar, inga kodblock.`;

// Små funktionsord som nästan alltid finns i löptext på respektive språk.
// serEngelsktUt i translateIngredients duger inte här: den är byggd för
// ingrediensnamn och har "salt", "oil", "rice" … som markörer — en svensk
// tillagning med "salt" i blev "engelsk", skickades till modellen, kom
// tillbaka lätt omformulerad och sparades som original, så ↔-knappen
// visades på svenska recept (2026-10-28).
const ENGELSKA_ORD = new Set([
  'the', 'and', 'with', 'until', 'into', 'for', 'of', 'to', 'a', 'an',
  'is', 'it', 'on', 'over', 'add', 'stir', 'heat', 'bake', 'cook', 'minutes',
  'then', 'from', 'your', 'about', 'remove', 'place', 'each', 'or',
]);
const SVENSKA_ORD = new Set([
  'och', 'med', 'till', 'tills', 'på', 'en', 'ett', 'att', 'det', 'den',
  'som', 'av', 'för', 'är', 'om', 'ner', 'upp', 'under', 'över', 'minuter',
  'sedan', 'låt', 'tillsätt', 'rör', 'koka', 'stek', 'häll', 'i', 'eller',
]);

/** Är löptexten engelsk? Räknar funktionsord på båda språken — fler engelska
 *  än svenska, och minst två, krävs. "in" saknas med flit ("sätt in i ugnen"). */
export function ärEngelskText(text: string): boolean {
  let en = 0;
  let sv = 0;
  for (const ord of text.toLowerCase().split(/[^a-zåäöé]+/)) {
    if (ENGELSKA_ORD.has(ord)) en++;
    if (SVENSKA_ORD.has(ord)) sv++;
  }
  return en >= 2 && en > sv;
}

/** Samma text bortsett från blanksteg och radbrytningar. */
const sammaText = (a: string, b: string) =>
  a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim();

/**
 * Engelsk text → svensk, med mått och temperaturer omräknade. Svensk text
 * lämnas orörd (men får ändå måtten omräknade, om någon skrivit "400°F").
 *
 * Returnerar null när ingenting behövde ändras — då ska originalet inte
 * sparas, eftersom det inte finns något att växla mellan.
 */
export async function översättInstruktioner(instructions: string): Promise<string | null> {
  const text = instructions.trim();
  if (!text) return null;

  if (!ärEngelskText(text)) {
    const omräknad = convertUnitsInText(text);
    return sammaText(omräknad, text) ? null : omräknad;
  }
  if (!anthropic) return null;

  try {
    const msg = await anthropic.messages.create({
      model: MODELL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: text }],
    });
    await bokförAiKostnad(MODELL, msg.usage);
    const svar = textUr(msg).trim();
    // Ett tomt eller absurt kort svar betyder att något gick fel — hellre
    // engelsk text som står kvar än ett recept som tappat sina steg.
    if (svar.length < Math.min(40, text.length / 3)) return null;
    const omräknad = convertUnitsInText(svar);
    return sammaText(omräknad, text) ? null : omräknad;
  } catch {
    return null;
  }
}
