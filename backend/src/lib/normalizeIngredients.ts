import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function normalizeIngredientNames(names: string[]): Promise<string[]> {
  if (names.length === 0) return [];
  if (!process.env.ANTHROPIC_API_KEY) return names;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: `Normalisera dessa ingredienssträngar från svenska recept till enkla svenska ingrediensnamn.

Regler:
- Ta bort tillagningsinstruktioner: "hackad", "skuren i bitar", "finriven", "pressad", "skalad", "delad", "kokt" osv
- Ta bort onödiga adjektiv: "färsk" om det är standardformen, "frysta" om det tydliggörs av kategorin
- Behåll viktiga distinktioner: "röd lök" ≠ "lök", "kycklingfilé" ≠ "kyckling", "crème fraiche" ≠ "grädde"
- Använd vanliga matbutiksnamn på svenska
- Returnera ENBART ett JSON-array med samma antal element som inmatningen, inget mer

Inmatning: ${JSON.stringify(names)}

Svar (bara JSON-arrayen):`,
      }],
    });

    const text = message.content[0].type === 'text' ? message.content[0].text.trim() : '';
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return names;

    const parsed = JSON.parse(match[0]) as unknown[];
    if (Array.isArray(parsed) && parsed.length === names.length && parsed.every(x => typeof x === 'string')) {
      return parsed as string[];
    }
  } catch (err) {
    console.error('[normalizeIngredients] failed, using original names:', err instanceof Error ? err.message : err);
  }

  return names;
}
