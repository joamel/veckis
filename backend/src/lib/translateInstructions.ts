import Anthropic from '@anthropic-ai/sdk';
import { serEngelsktUt } from './translateIngredients';
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

  const engelsk = serEngelsktUt([text]);
  if (!engelsk) {
    const omräknad = convertUnitsInText(text);
    return omräknad === text ? null : omräknad;
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
    return omräknad === text ? null : omräknad;
  } catch {
    return null;
  }
}
