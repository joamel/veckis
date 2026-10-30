import { combineQuantities, MASS_TO_G, VOLUME_TO_ML } from '@veckis/shared';

/**
 * "Smartare ihopslagning" i inventeringen: rader med EXAKT samma namn slås ihop
 * med hjälp av uppskattningar, även när enheterna inte går att räkna om
 * (1 kg + 4 st potatis) eller mängd saknas. Grädde och vispgrädde, eller olja och
 * rapsolja, kan vara olika varor och rörs aldrig.
 */
type Source = { qty: number | null };
type Row<S extends Source> = {
  key: string;
  name: string;
  unit: string | null;
  totalQty: number | null;
  measured: boolean;
  recipeTitles: string[];
  sources: S[];
  /** Satt när raden är en uppskattad ihopslagning. */
  estimatedFrom?: EstimatedPart[];
};

export type EstimatedPart = { qty: number | null; unit: string | null };
export type EstimateRequest = { name: string; unit: string | null; family: 'mass' | 'volume'; recipeTitle: string | null };

/** Var valet sparas (per enhet). */
export const SMART_MERGE_KEY = 'smart-inventory-merge';

const norm = (s: string) => s.toLowerCase().trim();

function base(unit: string | null): { family: 'volume' | 'mass'; factor: number } | null {
  const u = norm(unit ?? '');
  if (u in VOLUME_TO_ML) return { family: 'volume', factor: VOLUME_TO_ML[u] };
  if (u in MASS_TO_G) return { family: 'mass', factor: MASS_TO_G[u] };
  return null;
}

/** Mängd utan enhet ("3 potatisar") är styck. */
const rowUnit = (r: { unit: string | null; measured: boolean }) => (r.measured ? (r.unit ?? 'st') : null);

/** Nyckeln ett svar sparas under i appen. Per enhet gäller oavsett recept. */
export function estimateKey(req: EstimateRequest): string {
  return [norm(req.name), req.unit ?? '', req.family, req.unit ? '' : (req.recipeTitle ?? '')].join('|');
}

/** Raden med mätbar enhet som de andra slås ihop med — den första i gruppen. */
function anchorOf<S extends Source, R extends Row<S>>(group: R[]): R | null {
  return group.find(r => r.measured && r.totalQty && base(r.unit)) ?? null;
}

function groupByName<S extends Source, R extends Row<S>>(rows: R[]): R[][] {
  const groups = new Map<string, R[]>();
  for (const r of rows) {
    const k = norm(r.name);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }
  return [...groups.values()];
}

function requestFor<S extends Source, R extends Row<S>>(r: R, family: 'mass' | 'volume'): EstimateRequest {
  return { name: r.name, unit: rowUnit(r), family, recipeTitle: r.recipeTitles[0] ?? null };
}

/** Vilka uppskattningar som behövs. Utan en rad med mätbar mängd finns inget att slå ihop med. */
export function smartMergeRequests<S extends Source, R extends Row<S>>(rows: R[], skip: (name: string) => boolean = () => false): EstimateRequest[] {
  const out: EstimateRequest[] = [];
  for (const group of groupByName<S, R>(rows)) {
    if (group.length < 2 || skip(group[0].name)) continue;
    const anchor = anchorOf<S, R>(group);
    if (!anchor) continue;
    const family = base(anchor.unit)!.family;
    for (const r of group) if (r !== anchor) out.push(requestFor<S, R>(r, family));
  }
  return out;
}

/**
 * Slår ihop med hjälp av uppskattningarna (gram/ml per enhet, eller per recept
 * när mängd saknas). En rad utan svar lämnas som den är. Den nya raden minns
 * sina delar (estimatedFrom), så att det syns att den är ungefärlig och går att
 * dela upp igen (split = namnen som delats upp).
 */
export function smartMergeRows<S extends Source, R extends Row<S>>(rows: R[], estimates: Record<string, number | null>, split: Set<string> = new Set()): R[] {
  const out: R[] = [];
  for (const group of groupByName<S, R>(rows)) {
    const anchor = anchorOf<S, R>(group);
    if (group.length < 2 || !anchor || split.has(norm(anchor.name))) { out.push(...group); continue; }
    const from = base(anchor.unit)!;
    const baseUnit = from.family === 'mass' ? 'g' : 'ml';
    const amounts = new Map<R, number>();
    for (const r of group) {
      if (r === anchor) continue;
      const v = estimates[estimateKey(requestFor<S, R>(r, from.family))];
      if (v) amounts.set(r, v);
    }
    const merged = group.filter(r => amounts.has(r));
    if (merged.length === 0) { out.push(...group); continue; }

    // Varje källas mängd i bas-enheten (g/ml).
    const inBase = (r: R, s: S) => (r.measured ? (s.qty ?? 0) * amounts.get(r)! : amounts.get(r)!);
    const extra = merged.reduce((sum, r) => sum + r.sources.reduce((n, s) => n + inBase(r, s), 0), 0);
    const combined = combineQuantities([{ quantity: anchor.totalQty!, unit: anchor.unit }, { quantity: extra, unit: baseUnit }]);
    const target = combined ? base(combined.unit) : null;
    if (!combined || !target) { out.push(...group); continue; }

    const round = (n: number) => Math.round(n * 100) / 100;
    out.push({
      ...anchor,
      key: `${norm(anchor.name)}|${combined.unit}|~`,
      unit: combined.unit,
      totalQty: combined.quantity,
      recipeTitles: [...new Set([anchor, ...merged].flatMap(r => r.recipeTitles))],
      sources: [
        ...anchor.sources.map(s => ({ ...s, qty: s.qty == null ? null : round(s.qty * from.factor / target.factor) })),
        ...merged.flatMap(r => r.sources.map(s => ({ ...s, qty: round(inBase(r, s) / target.factor) }))),
      ],
      estimatedFrom: [anchor, ...merged].map(r => ({ qty: r.measured ? r.totalQty : null, unit: rowUnit(r) })),
    });
    out.push(...group.filter(r => r !== anchor && !amounts.has(r)));
  }
  return out;
}
