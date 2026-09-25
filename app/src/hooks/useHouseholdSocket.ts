import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

/** Så länge appen får ligga i bakgrunden innan socketen räknas som opålitlig. */
const STALE_AFTER_MS = 15_000;

function toWsUrl(householdId: string, token: string): string {
  const base = BASE_URL.replace(/^http/, 'ws');
  return `${base}/ws/household/${householdId}?token=${encodeURIComponent(token)}`;
}

export type HouseholdWsMessage =
  | { type: 'household_updated'; data: { id: string; name: string } }
  | { type: 'member_added'; data: { id: string; householdId: string; displayName: string; role: string; clerkUserId: string | null } }
  | { type: 'member_updated'; data: { id: string; householdId: string; displayName: string; role: string; clerkUserId: string | null } }
  | { type: 'member_deleted'; data: { id: string } }
  | { type: 'shopping_list_updated'; data: { listId: string } }
  | { type: 'shopping_presence'; data: { listId: string; memberId: string | null; since: string | null } }
  | { type: 'menu_updated'; data: { weekYear: number; weekNumber: number } };

export function useHouseholdSocket(
  householdId: string | null | undefined,
  getToken: () => Promise<string | null>,
  onMessage: (msg: HouseholdWsMessage) => void,
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
    if (!householdId) return;
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

      // Stäng en ev. redan öppen anslutning innan en ny skapas — annars kan
      // snabba bakgrund/förgrund-växlingar (AppState-lyssnaren nedan racear
      // mot onclose-reconnecten) lämna TVÅ levande sockets samtidigt. Servern
      // levererar då varje broadcast två gånger till samma klient, vilket
      // gjorde att menu_updated-echots suppress-räknare (+1) bara täckte
      // första leveransen — den andra slank igenom som en äkta omladdning
      // och orsakade ett synligt "blink" i menyn.
      if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }

      const ws = new WebSocket(toWsUrl(householdId!, token));
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
          const msg = JSON.parse(e.data as string) as HouseholdWsMessage;
          onMessageRef.current(msg);
        } catch { /* ignore */ }
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
  }, [householdId]);
}
