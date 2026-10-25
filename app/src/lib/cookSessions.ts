/**
 * Minimerade lagningar: laga-läget kan läggas undan utan att steg, avbockade
 * ingredienser och timrar försvinner. Förut nollställdes allt när läget
 * stängdes — timern man startat för pastan var borta så fort man gick till
 * inköpslistan.
 *
 * En session per recept. Den ligger här bara MEDAN den är minimerad: öppnas
 * laga-läget igen tas den tillbaka till receptskärmen (återuppta). Notiserna
 * för timrarna är redan schemalagda och följer med som id:n, så de larmar
 * även när appen är stängd.
 *
 * Lagras i utkastlagret (drafts.ts) och överlever därför att Android stänger
 * appen i bakgrunden. Timrarna är absoluta sluttider, så ingenting glider.
 */
import { useSyncExternalStore } from 'react';
import { createDraftStore, type MedTid } from './drafts';

/** name: bara egna timrar, valfritt ("Äggen"). */
export type CookTimer = { step: number; endsAt: number; notisId: string | null; name?: string | null };

/** Egna timrar i laga-läget (inte knutna till ett steg) får nycklar från och
 *  med det här talet, så att de kan ligga i samma tabell som stegens. */
export const EGEN_TIMER_BAS = 1000;
export const ärEgenTimer = (step: number) => step >= EGEN_TIMER_BAS;

/** Fler timrar än så per rätt blir rörigt i laga-läget och i klockan. Gäller
 *  egna timrar — stegens egna timrar går alltid att starta. */
export const MAX_TIMRAR_PER_RÄTT = 3;

export type CookSession = {
  recipeId: string;
  title: string;
  step: number;
  /** Avbockade ingredienser: id → steget de bockades av på. */
  checked: [string, number][];
  timers: CookTimer[];
  /** Portioner från veckomenyn, så mängderna stämmer när man kommer tillbaka. */
  servings: number | null;
};

/** En lagning som legat orörd ett dygn är inte längre pågående. */
const MAX_ÅLDER_MS = 24 * 60 * 60 * 1000;

const lager = createDraftStore<CookSession>('laga');
const lyssnare = new Set<() => void>();
let version = 0;
const meddela = () => { version++; lyssnare.forEach(l => l()); };

export function minimeraLagning(session: CookSession): void {
  lager.spara(session.recipeId, session);
  meddela();
}

/** Tar tillbaka en minimerad lagning till laga-läget, eller null. */
export function återupptaLagning(recipeId: string): CookSession | null {
  const s = lager.hamta(recipeId);
  if (!s) return null;
  lager.slang(recipeId);
  meddela();
  return s.sparadVid >= Date.now() - MAX_ÅLDER_MS ? s : null;
}

/** Ändrar en minimerad lagning på plats, t.ex. när en timer stoppas från
 *  klockans ark. Lagningen ligger kvar även utan timrar. */
export function ändraLagning(recipeId: string, fn: (s: CookSession) => CookSession): void {
  const s = lager.hamta(recipeId);
  if (!s) return;
  const { sparadVid: _, ...utan } = s;
  lager.spara(recipeId, fn(utan));
  meddela();
}

/** Avslutar en minimerad lagning utan att öppna den. Returnerar den, så att
 *  anroparen kan avboka notiserna. */
export function avslutaLagning(recipeId: string): CookSession | null {
  const s = lager.hamta(recipeId);
  if (!s) return null;
  lager.slang(recipeId);
  meddela();
  return s;
}

export function pågåendeLagningar(): MedTid<CookSession>[] {
  const gräns = Date.now() - MAX_ÅLDER_MS;
  return lager.alla().filter(s => s.sparadVid >= gräns);
}

function prenumerera(l: () => void) {
  lyssnare.add(l);
  return () => { lyssnare.delete(l); };
}

export function useLagningar(): MedTid<CookSession>[] {
  useSyncExternalStore(prenumerera, () => version, () => version);
  return pågåendeLagningar();
}
