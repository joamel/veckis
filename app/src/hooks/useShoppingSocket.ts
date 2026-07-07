import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import type { ShoppingItemWithRecipe } from '../api/client';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

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
) {
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const wsRef = useRef<WebSocket | null>(null);
  const unmountedRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!listId) return;
    unmountedRef.current = false;

    function clearReconnect() {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    }

    async function connect(attempt = 0) {
      if (unmountedRef.current) return;
      const token = await getToken();
      if (!token || unmountedRef.current) return;

      const ws = new WebSocket(toWsUrl(listId!, token));
      wsRef.current = ws;

      ws.onopen = () => { /* connected */ };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data as string) as ShoppingWsMessage;
          onMessageRef.current(msg);
        } catch { /* ignore malformed */ }
      };

      ws.onclose = () => {
        if (unmountedRef.current) return;
        const delay = Math.min(500 * 2 ** attempt, 30_000);
        reconnectTimerRef.current = setTimeout(() => connect(attempt + 1), delay);
      };

      ws.onerror = () => ws.close();
    }

    connect();

    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        const ws = wsRef.current;
        if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
          clearReconnect();
          connect();
        }
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
