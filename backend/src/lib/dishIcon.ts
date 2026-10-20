/**
 * Matsymbolen som platshållaren visar för ett recept utan bild. AI:n väljer
 * EN gång per recept (när det skapas eller byter namn) bland appens symboler
 * (DISH_ICON_EMOJIS) och resultatet sparas på receptet — aldrig ett anrop per
 * visning.
 */
import Anthropic from '@anthropic-ai/sdk';
import { DISH_ICON_EMOJIS, DISH_ICON_FALLBACK, isDishIconEmoji } from '@veckis/shared';
import { prisma } from '../db';
import { textUr } from './aiJson';
import { bokförAiKostnad } from './aiCost';
import { firstEmoji } from './twemoji';

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;
const MODELL = 'claude-haiku-4-5-20251001';

// Särskiljande före generiskt: med 🐟 för varje fiskrätt låg tio likadana
// fiskar bredvid varandra i receptlistan (feedback 2026-10-20).
const SYSTEM = `Välj den symbol som bäst föreställer maträtten, bland ENBART dessa: ${DISH_ICON_EMOJIS.join(' ')}

Välj det mest SÄRSKILJANDE: rättens form före huvudråvaran (soppa 🍲, gryta/gratäng/ugnsrätt 🥘, pasta 🍝, nudlar 🍜, curry 🍛, sallad 🥗, wok/ris 🍚, wrap 🌯, tacos 🌮, paj 🥧, pannkakor 🥞). Finns ingen sådan form, välj råvaran som skiljer rätten från andra: räkor 🍤, krabba 🦀, musslor 🦪, kyckling 🍗, fläsk 🥓, nötkött 🥩, ägg 🍳, svamp 🍄, potatis 🥔 — och 🐟 bara för fisk som inte passar något annat. Svara med enbart symbolen.`;

export async function chooseDishIcon(title: string, ingredients: string[]): Promise<string> {
  if (!anthropic) return DISH_ICON_FALLBACK;
  try {
    const msg = await anthropic.messages.create({
      model: MODELL,
      max_tokens: 16,
      system: SYSTEM,
      messages: [{ role: 'user', content: `${title}\nIngredienser: ${ingredients.slice(0, 15).join(', ')}` }],
    });
    await bokförAiKostnad(MODELL, msg.usage);
    const e = firstEmoji(textUr(msg));
    // Utan variantväljaren ("🌶" i stället för "🌶️") — samma symbol.
    const match = e && (isDishIconEmoji(e) ? e : DISH_ICON_EMOJIS.find(d => d.replace(/️/g, '') === e.replace(/️/g, '')));
    return match ?? DISH_ICON_FALLBACK;
  } catch {
    return DISH_ICON_FALLBACK;
  }
}

/** Väljer och sparar symbolen för ett recept. Tyst vid fel — platshållaren klarar sig utan. */
export async function assignDishIcon(recipeId: string): Promise<void> {
  try {
    const r = await prisma.recipe.findUnique({ where: { id: recipeId }, select: { title: true, ingredients: { select: { name: true } } } });
    if (!r) return;
    const icon = await chooseDishIcon(r.title, r.ingredients.map(i => i.name));
    await prisma.recipe.update({ where: { id: recipeId }, data: { iconEmoji: icon } });
  } catch (e) {
    console.error('[matsymbol]', recipeId, e instanceof Error ? e.message : e);
  }
}
