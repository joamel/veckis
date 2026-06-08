export type TipGateResult =
  | 'blocked'   // fyra inte: välkomstmodalen blockerar eller master kill-switch på
  | 'duplicate' // redan aktiv eller köad → no-op (men räknas som "hanterad")
  | 'show';     // fortsätt: visa direkt eller lägg i kö

/**
 * Ren beslutslogik för SpotlightTip-gaten (utbruten ur SpotlightTipContext).
 * Avgör om ett tip ska visas, blockeras eller är en dubblett — utan att röra
 * provider-state. Provider-koden mappar resultatet till enqueue/return.
 */
export function evaluateTipGate(params: {
  welcomeReady: boolean;
  skipAll: boolean;
  activeTitle: string | null;
  queuedTitles: string[];
  title: string;
}): TipGateResult {
  const { welcomeReady, skipAll, activeTitle, queuedTitles, title } = params;
  if (!welcomeReady) return 'blocked';
  if (skipAll) return 'blocked';
  if (activeTitle === title) return 'duplicate';
  if (queuedTitles.includes(title)) return 'duplicate';
  return 'show';
}
