import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import type { ScheduleEntry, Chore, ChoreCompletion } from '@veckis/shared';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

function toWsUrl(householdId: string, token: string): string {
  const base = BASE_URL.replace(/^http/, 'ws');
  return `${base}/ws/household/${householdId}?token=${encodeURIComponent(token)}`;
}

export type HouseholdWsMessage =
  | { type: 'schedule_entry_added'; data: ScheduleEntry }
  | { type: 'schedule_entry_updated'; data: ScheduleEntry }
  | { type: 'schedule_entry_deleted'; data: { id: string } }
  | { type: 'chore_added'; data: Chore & { completions: ChoreCompletion[] } }
  | { type: 'chore_updated'; data: Chore }
  | { type: 'chore_deleted'; data: { id: string } }
  | { type: 'chore_completed'; data: ChoreCompletion }
  | { type: 'chore_uncompleted'; data: { id: string } }
  | { type: 'household_updated'; data: { id: string; name: string } }
  | { type: 'member_added'; data: { id: string; householdId: string; displayName: string; role: string; clerkUserId: string | null } }
  | { type: 'member_updated'; data: { id: string; householdId: string; displayName: string; role: string; clerkUserId: string | null } }
  | { type: 'member_deleted'; data: { id: string } };

export function useHouseholdSocket(
  householdId: string | undefined,
  getToken: () => Promise<string | null>,
  onMessage: (msg: HouseholdWsMessage) => void,
) {
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const wsRef = useRef<WebSocket | null>(null);
  const unmountedRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!householdId) return;
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

      const ws = new WebSocket(toWsUrl(householdId!, token));
      wsRef.current = ws;

      ws.onopen = () => { /* connected */ };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data as string) as HouseholdWsMessage;
          onMessageRef.current(msg);
        } catch { /* ignore */ }
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
  }, [householdId]);
}
