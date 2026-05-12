import { WebSocket } from 'ws';

const subscribers = new Map<string, Set<WebSocket>>();

export function wsSubscribe(listId: string, ws: WebSocket): void {
  if (!subscribers.has(listId)) subscribers.set(listId, new Set());
  subscribers.get(listId)!.add(ws);
}

export function wsUnsubscribe(listId: string, ws: WebSocket): void {
  const subs = subscribers.get(listId);
  if (!subs) return;
  subs.delete(ws);
  if (subs.size === 0) subscribers.delete(listId);
}

export function wsBroadcast(listId: string, message: object): void {
  const subs = subscribers.get(listId);
  if (!subs) return;
  const payload = JSON.stringify(message);
  for (const ws of subs) {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  }
}
