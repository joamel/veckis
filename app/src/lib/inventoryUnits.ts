import { combineQuantities, MASS_TO_G, VOLUME_TO_ML } from '@veckis/shared';

type Source = { qty: number | null };
type Row<S extends Source> = {
  key: string;
  name: string;
  unit: string | null;
  totalQty: number | null;
  measured: boolean;
  recipeTitles: string[];
  sources: S[];
};

function base(unit: string | null): { family: 'volume' | 'mass'; factor: number } | null {
  const u = (unit ?? '').toLowerCase().trim();
  if (u in VOLUME_TO_ML) return { family: 'volume', factor: VOLUME_TO_ML[u] };
  if (u in MASS_TO_G) return { family: 'mass', factor: MASS_TO_G[u] };
  return null;
}

/**
 * Slår ihop inventeringsrader med samma namn när enheterna går att räkna om:
 * "2 msk grädde" + "3 dl grädde" blir EN rad, 3,3 dl. Samma regel som
 * inköpslistans sammanslagning (combineQuantities i shared), så det man
 * inventerar är det som hamnar i listan.
 *
 * Varje källas mängd räknas om till den nya enheten — överföringen fördelar
 * det som ska köpas tillbaka per rätt, och räknar då i radens enhet.
 * Styck mot gram, och rader utan mängd, lämnas som de är: de hamnar ändå
 * intill varandra, och dubbletthanteraren i listan lär sig förpackningarna.
 */
export function mergeConvertibleUnits<S extends Source, R extends Row<S>>(rows: R[]): R[] {
  const groups = new Map<string, R[]>();
  const out: R[] = [];
  for (const r of rows) {
    const b = r.measured && r.totalQty ? base(r.unit) : null;
    if (!b) { out.push(r); continue; }
    const k = `${r.name.toLowerCase().trim()}|${b.family}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }
  for (const group of groups.values()) {
    if (group.length === 1) { out.push(group[0]); continue; }
    const combined = combineQuantities(group.map(r => ({ quantity: r.totalQty!, unit: r.unit })));
    const target = combined ? base(combined.unit) : null;
    if (!combined || !target) { out.push(...group); continue; }
    const first = group[0];
    out.push({
      ...first,
      key: `${first.name.toLowerCase().trim()}|${combined.unit}`,
      unit: combined.unit,
      totalQty: combined.quantity,
      recipeTitles: [...new Set(group.flatMap(r => r.recipeTitles))],
      sources: group.flatMap(r => {
        const from = base(r.unit)!.factor;
        return r.sources.map(s => ({ ...s, qty: s.qty == null ? null : Math.round((s.qty * from / target.factor) * 100) / 100 }));
      }),
    });
  }
  return out;
}
