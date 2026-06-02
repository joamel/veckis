// Lättviktig "pick a store from /stores"-resolver. Pattern speglar hur recept
// väljs ut för veckomenyn: caller pushar /stores med ?pick=1; nästa skärm
// resolver:ar promise:n när användaren tappar en butik (eller hoppar tillbaka
// → null). Inget React state behövs i mottagaren — bara await.

/** Resultat: 'cancelled' = användaren backade utan val, null = "Ingen butik",
 *  string = vald butik. */
export type PickResult = string | null | 'cancelled';
type Resolver = (result: PickResult) => void;

let pendingResolver: Resolver | null = null;

export function pickStore(): Promise<PickResult> {
  if (pendingResolver) pendingResolver('cancelled');
  return new Promise(resolve => {
    pendingResolver = resolve;
  });
}

export function resolveStorePick(result: PickResult): void {
  const r = pendingResolver;
  pendingResolver = null;
  if (r) r(result);
}

export function hasPendingStorePick(): boolean {
  return pendingResolver !== null;
}
