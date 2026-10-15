import { amountLabel } from './quickList';
// Kategoribläddrarens högerkant per vara. Finns varan inte på listan läggs den
// till med +. Finns den visas mängden med enhet ("2 st", "400 g") och ett tryck
// öppnar redigeringen — ett − antal + utan enhet sa för lite (2 av vad?).

type Item = { id: string; quantity: number | null; unit: string | null; isChecked: boolean; name: string };

export type BrowserEntry<T> = { target: T; label: string } | null;

export function browserEntryFor<T extends Item>(items: T[], name: string): BrowserEntry<T> {
  const key = name.trim().toLowerCase();
  const target = items.find(i => !i.isChecked && i.name.trim().toLowerCase() === key);
  if (!target) return null;
  // Som listan visar mängden: köksmått och enheten böjd efter antalet.
  return { target, label: amountLabel(target.quantity ?? null, target.unit ?? null) };
}
