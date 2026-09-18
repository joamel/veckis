import Anthropic from '@anthropic-ai/sdk';
import { textUr } from './aiJson';
import { bokförAiKostnad } from './aiCost';

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const MODELL = 'claude-haiku-4-5-20251001';

// Ord som i praktiken bara förekommer i engelska receptrader. Räcker att ETT
// namn i receptet träffar för att hela listan ska skickas till översättning —
// en engelsk sajt har aldrig bara en engelsk rad, och batchen kostar lika
// mycket oavsett. Tvärtom sparar heuristiken hela anropet för svenska sajter,
// vilket är de allra flesta importerna.
const ENGELSKA_MARKÖRER = new Set([
  'the', 'of', 'with', 'and', 'or', 'fresh', 'ground', 'chopped', 'sliced',
  'minced', 'grated', 'shredded', 'diced', 'melted', 'softened', 'divided',
  'boneless', 'skinless', 'large', 'small', 'medium', 'extra', 'virgin',
  'all-purpose', 'purpose', 'granulated', 'powdered', 'unsalted', 'salted',
  'chicken', 'beef', 'pork', 'cheese', 'flour', 'sugar', 'butter', 'oil',
  'milk', 'cream', 'eggs', 'egg', 'water', 'salt', 'pepper', 'onion',
  'onions', 'garlic', 'tomatoes', 'tomato', 'potatoes', 'potato', 'rice',
  'beans', 'juice', 'sauce', 'stock', 'broth', 'vinegar', 'baking', 'soda',
  'vanilla', 'cinnamon', 'parsley', 'cilantro', 'basil', 'thyme',
]);

/** True om NÅGOT av namnen ser engelskt ut. Billig gate före AI-anropet. */
export function serEngelsktUt(names: string[]): boolean {
  return names.some(n =>
    n.toLowerCase().split(/[\s,()/-]+/).some(w => ENGELSKA_MARKÖRER.has(w))
  );
}

const SYSTEM_PROMPT = `Du översätter ingrediensnamn från engelska till svenska för en inköpslista.
Regler:
- Översätt till det namn en svensk skulle leta efter i butiken ("all-purpose flour" → "vetemjöl", "heavy cream" → "vispgrädde", "scallions" → "salladslök", "cilantro" → "koriander")
- Namn som REDAN är svenska returneras helt oförändrade
- Översätt bara namnet. Ta inte bort tillagningsbeskrivningar, lägg inte till mängder eller enheter
- Egennamn och varumärken behålls ("Worcestershire sauce" → "worcestershiresås", "Old Bay" → "Old Bay")
- Returnera ENBART ett JSON-array med samma antal element i samma ordning som indata, inga förklaringar.

Exempel:
Input: ["boneless chicken thighs","all-purpose flour","vetemjöl","fresh cilantro","heavy cream"]
Output: ["benfria kycklinglår","vetemjöl","vetemjöl","färsk koriander","vispgrädde"]`;

/**
 * Översätter engelska ingrediensnamn till svenska. Returnerar ett värde per
 * indata-namn: översättningen, eller originalet om namnet redan var svenskt.
 *
 * Behövs bara för JSON-LD-grenen i URL-importen. Text- och fotoimporten går via
 * en AI-tolkning som redan ombeds svara på svenska — det är just därför sajter
 * MED korrekt schema.org-markup var de som behöll engelska namn, medan sajter
 * utan fick dem översatta.
 *
 * Vid fel, saknad nyckel eller svar med fel längd returneras indata oförändrat:
 * ett oöversatt recept är en sämre import, ett trasigt är en förlorad.
 */
export async function översättIngrediensnamn(names: string[]): Promise<string[]> {
  if (names.length === 0 || !anthropic || !serEngelsktUt(names)) return names;

  try {
    const msg = await anthropic.messages.create({
      model: MODELL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Input: ${JSON.stringify(names)}\nOutput:` }],
    });
    await bokförAiKostnad(MODELL, msg.usage);
    const parsed = JSON.parse(textUr(msg)) as unknown;
    if (!Array.isArray(parsed) || parsed.length !== names.length) return names;
    return parsed.map((n, i) =>
      typeof n === 'string' && n.trim().length > 0 ? n.trim() : names[i]
    );
  } catch {
    return names;
  }
}
