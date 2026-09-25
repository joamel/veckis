import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import type { ShoppingItemWithRecipe } from '../api/client';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

/** Så länge appen får ligga i bakgrunden innan socketen räknas som opålitlig. */
const STALE_AFTER_MS = 15_000;

function toWsUrl(listId: string, token: string): string {
  const base = BASE_URL.replace(/^http/, 'ws');
  return `${base}/ws/shopping/${listId}?token=${encodeURIComponent(token)}`;
}

export type ShoppingWsMessage =
  | { type: 'item_added'; data: ShoppingItemWithRecipe; actor?: string }
  | { type: 'item_updated'; data: ShoppingItemWithRecipe; actor?: string }
  | { type: 'item_deleted'; data: { id: string }; actor?: string }
  | { type: 'list_cleared' }
  | { type: 'items_auto_merged'; data: { name: string; count: number } }
  | { type: 'shopping_presence'; data: { listId: string; memberId: string | null; since: string | null } };

export function useShoppingSocket(
  listId: string | undefined,
  getToken: () => Promise<string | null>,
  onMessage: (msg: ShoppingWsMessage) => void,
  /** Anropas när socketen öppnats IGEN efter ett avbrott. Det som hände medan
   *  den var nere är borta — servern köar inget — så anroparen ska hämta om. */
  onReconnect?: () => void,
) {
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const onReconnectRef = useRef(onReconnect);
  onReconnectRef.current = onReconnect;
  const hasConnectedRef = useRef(false);
  const attemptRef = useRef(0);
  const backgroundedAtRef = useRef<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const unmountedRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!listId) return;
    unmountedRef.current = false;
    // Ny lista/nytt hushåll: första anslutningen är ingen återanslutning.
    hasConnectedRef.current = false;
    attemptRef.current = 0;

    function clearReconnect() {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    }

    async function connect() {
      if (unmountedRef.current) return;
      const token = await getToken();
      if (!token || unmountedRef.current) return;

      // Se useHouseholdSocket.ts för varför — förhindrar två samtidigt
      // levande sockets (dubblerade broadcast-leveranser) vid snabba
      // bakgrund/förgrund-växlingar.
      if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }

      const ws = new WebSocket(toWsUrl(listId!, token));
      wsRef.current = ws;

      ws.onopen = () => {
        // Backoffen börjar om efter en lyckad anslutning. Förut växte den över
        // hela sessionen, så efter några avbrott väntade man 30 s varje gång.
        attemptRef.current = 0;
        if (hasConnectedRef.current) onReconnectRef.current?.();
        hasConnectedRef.current = true;
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data as string) as ShoppingWsMessage;
          onMessageRef.current(msg);
        } catch { /* ignore malformed */ }
      };

      ws.onclose = () => {
        if (unmountedRef.current) return;
        const delay = Math.min(500 * 2 ** attemptRef.current, 30_000);
        attemptRef.current += 1;
        reconnectTimerRef.current = setTimeout(() => connect(), delay);
      };

      ws.onerror = () => ws.close();
    }

    connect();

    // Efter en stund i bakgrunden ansluter vi om ÄVEN om socketen säger OPEN.
    // Android stänger ofta anslutningen i det tysta när telefonen låses, och
    // klienten får aldrig veta det: readyState står kvar på OPEN, ingen
    // onclose kommer, och inga uppdateringar heller. Så såg det ut som att
    // listan slutat synka tills man gick ut och in i den. Korta växlingar
    // (under STALE_AFTER_MS) rör vi inte — de dödar sällan anslutningen, och
    // varje återanslutning räknas mot serverns gräns per IP.
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        if (backgroundedAtRef.current === null) backgroundedAtRef.current = Date.now();
        return;
      }
      const away = backgroundedAtRef.current === null ? 0 : Date.now() - backgroundedAtRef.current;
      backgroundedAtRef.current = null;
      const ws = wsRef.current;
      const dead = !ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING;
      if (dead || away > STALE_AFTER_MS) {
        clearReconnect();
        attemptRef.current = 0;
        connect();
      }
    });

    return () => {
      unmountedRef.current = true;
      clearReconnect();
      wsRef.current?.close();
      appStateSub.remove();
    };
  }, [listId]);
}
