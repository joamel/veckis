// Det som delats till Handlis från en annan app (Safari, Instagram, ICA …),
// tolkat som ett receptutkast: en länk hämtas, en text tolkas.
import { pastedLink } from './extractUrl';

export type SharedRecipeDraft =
  | { mode: 'url'; url: string }
  | { mode: 'paste'; text: string };

/**
 * Samma regel som fältet "Klistra in länk eller recept": i princip bara en
 * länk (ICA:s delning har receptnamnet före länken) → hämtas som länk; annars
 * är det ett recept som tolkas. Tomt → null, inget att öppna.
 * `webUrl` är länken delningen själv plockat ut — den används bara när texten
 * saknas, så receptnamnet runt en länk inte går förlorat i onödan.
 */
export function sharedRecipeDraft(shared: { text?: string | null; webUrl?: string | null }): SharedRecipeDraft | null {
  const text = (shared.text ?? '').trim() || (shared.webUrl ?? '').trim();
  if (!text) return null;
  const link = pastedLink(text);
  return link ? { mode: 'url', url: link } : { mode: 'paste', text };
}
