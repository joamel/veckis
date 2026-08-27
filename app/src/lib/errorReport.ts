import { Platform } from 'react-native';
import Constants from 'expo-constants';

const MAX_MESSAGE = 4000;
const MAX_STACK = 8000;
const DEDUPE_MS = 10_000;
const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export interface ClientErrorReport {
  name: string;
  message: string;
  stack: string | null;
  context: Record<string, unknown>;
  platform: string;
  appVersion: string;
  at: string;
}

/**
 * Bygger en strukturerad felrapport från valfritt kastat värde (Error eller
 * annat). Ren funktion — meta (platform/version) skickas in så den är testbar.
 * Trunkerar message/stack så vi inte skickar megabytes.
 */
export function buildErrorReport(
  error: unknown,
  context: Record<string, unknown>,
  meta: { platform: string; appVersion: string },
): ClientErrorReport {
  const err = error instanceof Error ? error : null;
  const rawMessage = err?.message ?? (typeof error === 'string' ? error : String(error));
  return {
    name: err?.name ?? 'Error',
    message: (rawMessage || 'Okänt fel').slice(0, MAX_MESSAGE),
    stack: err?.stack ? err.stack.slice(0, MAX_STACK) : null,
    context: context ?? {},
    platform: meta.platform,
    appVersion: meta.appVersion,
    at: new Date().toISOString(),
  };
}

const recent = new Map<string, number>();

/**
 * Skickar ett klientfel till backend (→ Render-loggar) så prod-fel blir
 * synliga. Best-effort & fire-and-forget — får ALDRIG kasta eller blockera.
 * Dedupar identiska fel inom ett kort fönster så en loop inte spammar.
 */
export function reportClientError(error: unknown, context: Record<string, unknown> = {}): void {
  try {
    const report = buildErrorReport(error, context, {
      platform: Platform.OS,
      appVersion: Constants.expoConfig?.version ?? 'okänd',
    });
    const key = `${report.name}:${report.message}`;
    const now = Date.now();
    if (now - (recent.get(key) ?? 0) < DEDUPE_MS) return;
    recent.set(key, now);
    fetch(`${BASE_URL}/api/client-errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
    }).catch(() => {});
  } catch {
    // Rapportören får aldrig krascha appen.
  }
}

let installed = false;

/**
 * Fångar ouppfångade JS-fel app-brett via RN:s ErrorUtils (utöver render-fel
 * som ErrorBoundary tar). Bevarar den tidigare handlern (RN:s röda ruta i dev).
 */
export function installGlobalErrorHandler(): void {
  if (installed) return;
  installed = true;
  const g = globalThis as unknown as {
    ErrorUtils?: {
      getGlobalHandler?: () => (e: unknown, isFatal?: boolean) => void;
      setGlobalHandler?: (h: (e: unknown, isFatal?: boolean) => void) => void;
    };
  };
  const prev = g.ErrorUtils?.getGlobalHandler?.();
  g.ErrorUtils?.setGlobalHandler?.((err, isFatal) => {
    reportClientError(err, { kind: 'global', isFatal: !!isFatal });
    prev?.(err, isFatal);
  });
}
