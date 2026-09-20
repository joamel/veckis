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

/**
 * En listhändelse till både listans egen kanal och hushållets: listan så att
 * den som har den öppen ser ändringen, hushållet så att översikten uppdateras.
 *
 * Ligger här och inte i shopping-routen eftersom fler än inköpslistan skriver
 * till listor — basvaru-editorn flyttar varor mellan kategorier och måste
 * skicka samma händelse, annars ser den som står i affären ingenting förrän
 * hen laddar om.
 */
export function wsListUpdate(listId: string, householdId: string, message: object): void {
  wsBroadcast(listId, message);
  wsBroadcast(`household:${householdId}`, { type: 'shopping_list_updated', data: { listId } });
}
