/**
 * Bokför vad AI-anropen kostar och larmar när månadens nota passerar en gräns.
 *
 * Räknaren ligger i databasen, inte i processminnet: Railway deployar ofta och
 * en minnesräknare hade nollställts varje gång — precis när man som mest behöver
 * veta att kostnaden dragit iväg.
 *
 * Belopp hålls i ÖRE som heltal. Flyttal och pengar hör inte ihop.
 */

import * as Sentry from '@sentry/node';
import { prisma } from '../db';

/** Dollarpris per miljon tokens, per modell. Uppdatera när prislistan ändras. */
const PRIS_USD_PER_MTOK: Record<string, { in: number; ut: number }> = {
  'claude-haiku-4-5': { in: 1, ut: 5 },
  'claude-sonnet-5': { in: 2, ut: 10 },
  'claude-opus-5': { in: 5, ut: 25 },
};

/** Grov växelkurs. Exakthet spelar ingen roll för ett larm — storleksordningen gör det. */
const SEK_PER_USD = 10.5;

/** Månadens varningsgräns i öre. 100 kr. */
export const VARNINGSGRANS_ORE = 10_000;

const månadsnyckel = () => new Date().toISOString().slice(0, 7);

function tillÖre(model: string, inTokens: number, utTokens: number): number {
  // Okänd modell prissätts som den dyraste vi känner till: hellre larma i onödan
  // än att missa en kostnad för att prislistan inte hunnit uppdateras.
  // Modell-id kan vara datumstämplat ('claude-haiku-4-5-20251001'). Prislistan
  // hålls på basnamnet, så datumsuffixet skalas bort före uppslaget.
  const bas = model.replace(/-\d{8}$/, '');
  const pris = PRIS_USD_PER_MTOK[bas]
    ?? Object.values(PRIS_USD_PER_MTOK).reduce((a, b) => (b.in > a.in ? b : a));
  const usd = (inTokens * pris.in + utTokens * pris.ut) / 1_000_000;
  return Math.round(usd * SEK_PER_USD * 100);
}

/**
 * Bokför ett anrop. Kastar aldrig — en bokföringsmiss får inte fälla ett
 * lyckat AI-svar som användaren väntar på.
 */
export async function bokförAiKostnad(
  model: string,
  usage: { input_tokens?: number; output_tokens?: number } | undefined,
): Promise<void> {
  try {
    const inTokens = usage?.input_tokens ?? 0;
    const utTokens = usage?.output_tokens ?? 0;
    if (inTokens === 0 && utTokens === 0) return;

    const month = månadsnyckel();
    const öre = tillÖre(model, inTokens, utTokens);

    const rad = await prisma.aiUsage.upsert({
      where: { month },
      create: { month, inputTokens: inTokens, outputTokens: utTokens, costOre: öre },
      update: {
        inputTokens: { increment: inTokens },
        outputTokens: { increment: utTokens },
        costOre: { increment: öre },
      },
    });

    // warnedAt gör larmet till en engångshändelse per månad. Utan den hade varje
    // anrop efter gränsen skickat ett nytt larm, och larmet blivit brus.
    if (rad.costOre >= VARNINGSGRANS_ORE && !rad.warnedAt) {
      await prisma.aiUsage.update({ where: { month }, data: { warnedAt: new Date() } });
      const kr = (rad.costOre / 100).toFixed(0);
      const text = `AI-kostnaden för ${month} har passerat ${VARNINGSGRANS_ORE / 100} kr (nu ~${kr} kr).`;
      console.error(text);
      Sentry.captureMessage(text, 'warning');
    }
  } catch (err) {
    // Loggas men sväljs: kostnadsbokföring får aldrig gå före funktionen.
    console.error('Kunde inte bokföra AI-kostnad:', err instanceof Error ? err.message : err);
  }
}
