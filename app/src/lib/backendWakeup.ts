// Wake-up-spårning för Render free-tier-backenden. Servern sover efter
// ~15 min inaktivitet och första request kan ta 20-30 sek. Utan
// indikator ser appen "trasig" ut för användaren — hen tror att
// nätet är dött eller appen hänger.
//
// Strategi: räkna time-to-first-byte på första API-anropet efter mount.
// Om det dröjer > 3 sek innan svaret kommer, fyra 'waking' så ett
// banner-UI kan visa "Vaknar...". När anropet klarar (lyckas) sätts
// vakenheten permanent — vi spammar inte indikatorn på efterföljande
// anrop som svarar normalt.

type WakeupState = 'waking' | 'awake';
type Listener = (state: WakeupState) => void;

const listeners = new Set<Listener>();
let isAwake = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let notified = false;
const SLOW_MS = 3000;

/** Wrap:a en pågående request-promise. Klart i fire-and-forget-stil
 *  — caller behåller det ursprungliga promise-värdet. */
export function trackBackendRequest<T>(promise: Promise<T>): Promise<T> {
  if (isAwake) return promise;
  if (!timer && !notified) {
    timer = setTimeout(() => {
      timer = null;
      notified = true;
      listeners.forEach(l => l('waking'));
    }, SLOW_MS);
  }
  return promise.then(v => {
    isAwake = true;
    if (timer) { clearTimeout(timer); timer = null; }
    if (notified) listeners.forEach(l => l('awake'));
    return v;
  });
  // Notera: vi resettar inte vid catch — en failad request betyder
  // inte att backend är vaken. Nästa anrop kan trigga ny waking-toast
  // efter SLOW_MS om så krävs.
}

export function subscribeBackendWakeup(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
