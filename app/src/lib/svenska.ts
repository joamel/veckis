// i18n-facade. Behåller de befintliga namespace-exporterna (common, shopping, …)
// men gör dem till PROXIES som pekar på det aktiva språket. Därför behöver inga
// komponenter ändra sina imports — de läser `str.foo` vid render och proxyn
// resolvar mot aktuell locale.
//
// Byt språk med setLocale('en'); LocaleProvider (context) triggar en omrendering
// (remount via key) så hela trädet läser om.

import * as sv from './locales/sv';
import * as enOverride from './locales/en';

export type Locale = 'sv' | 'en';

type Bundle = typeof sv;
type NsKey = keyof Bundle;

// Djup-merge: engelska värden ersätter svenska leaf-för-leaf; det som saknas i
// en.ts faller tillbaka på svenska (funktioner/arrayer ersätts som helhet).
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
function deepMerge(base: unknown, over: unknown): unknown {
  if (over === undefined) return base;
  if (!isPlainObject(base) || !isPlainObject(over)) return over;
  const out: Record<string, unknown> = { ...base };
  for (const k of Object.keys(over)) out[k] = deepMerge(base[k], over[k]);
  return out;
}

const svBundle = sv as unknown as Record<string, unknown>;
const enOv = enOverride as unknown as Record<string, unknown>;
const en = {} as Bundle;
for (const key of Object.keys(svBundle)) {
  (en as unknown as Record<string, unknown>)[key] = deepMerge(svBundle[key], enOv[key]);
}

const bundles: Record<Locale, Bundle> = { sv, en };
let current: Locale = 'sv';

const listeners = new Set<() => void>();
export function getLocale(): Locale { return current; }
export function setLocale(l: Locale): void {
  if (l === current) return;
  current = l;
  listeners.forEach(fn => fn());
}
export function onLocaleChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Proxy för ett namespace som alltid delegerar till aktivt språk. */
function ns<K extends NsKey>(key: K): Bundle[K] {
  const target = {} as object;
  return new Proxy(target, {
    get: (_t, prop) => (bundles[current][key] as Record<PropertyKey, unknown>)[prop],
    has: (_t, prop) => prop in (bundles[current][key] as object),
    ownKeys: () => Reflect.ownKeys(bundles[current][key] as object),
    getOwnPropertyDescriptor: (_t, prop) => {
      const d = Object.getOwnPropertyDescriptor(bundles[current][key] as object, prop);
      if (d) d.configurable = true;
      return d;
    },
  }) as Bundle[K];
}

export const common          = ns('common');
export const chores          = ns('chores');
export const schedule        = ns('schedule');
export const shopping        = ns('shopping');
export const shoppingList    = ns('shoppingList');
export const menu            = ns('menu');
export const recipes         = ns('recipes');
export const settings        = ns('settings');
export const stores          = ns('stores');
export const components      = ns('components');
export const history         = ns('history');
export const auth            = ns('auth');
export const account         = ns('account');
export const preferences     = ns('preferences');
export const householdSetup  = ns('householdSetup');
export const install         = ns('install');
