import { prisma } from '../db';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/** Preference keys on NotificationPreference — one per notification type. */
export type NotificationType = 'activityReminder' | 'choreOverdue' | 'listCleared' | 'newMember' | 'shopperClaimed' | 'shopperItemAdded' | 'choreCompleted';

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

interface ExpoMessage extends PushPayload {
  to: string;
  sound: 'default';
}

interface ExpoTicket {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Send a push notification to the given users, honouring their per-type
 * preference (defaults to on when no preference row exists). Looks up every
 * device token for each user and posts to the Expo Push API in batches.
 * Tokens Expo reports as unregistered are pruned. Never throws — push is
 * best-effort and must not break the request that triggered it.
 */
export async function sendPush(
  clerkUserIds: string[],
  type: NotificationType,
  payload: PushPayload,
): Promise<void> {
  const userIds = [...new Set(clerkUserIds)].filter(Boolean);
  if (userIds.length === 0) return;

  // Drop users who opted out of this notification type.
  const prefs = await prisma.notificationPreference.findMany({
    where: { clerkUserId: { in: userIds } },
  });
  const optedOut = new Set(prefs.filter(p => !p[type]).map(p => p.clerkUserId));
  const recipients = userIds.filter(id => !optedOut.has(id));
  await deliverPush(recipients, payload);
}

/**
 * Sends a payload to every device token of the given users, ignoring
 * preferences. Returns how many tokens were targeted and any Expo error tickets
 * — used by the in-app "send test notification" endpoint for diagnostics.
 * Never throws.
 */
export async function deliverPush(
  clerkUserIds: string[],
  payload: PushPayload,
): Promise<{ tokens: number; errors: string[] }> {
  const errors: string[] = [];
  try {
    const recipients = [...new Set(clerkUserIds)].filter(Boolean);
    if (recipients.length === 0) return { tokens: 0, errors };

    const tokens = await prisma.pushToken.findMany({
      where: { clerkUserId: { in: recipients } },
      select: { token: true },
    });
    if (tokens.length === 0) return { tokens: 0, errors };

    const messages: ExpoMessage[] = tokens.map(t => ({
      to: t.token,
      sound: 'default',
      title: payload.title,
      body: payload.body,
      data: payload.data,
    }));

    for (const batch of chunk(messages, 100)) {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(batch),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.error('Expo push failed:', res.status, text);
        errors.push(`HTTP ${res.status}`);
        continue;
      }
      const json = (await res.json().catch(() => null)) as { data?: ExpoTicket[] } | null;
      const tickets = json?.data ?? [];
      const dead: string[] = [];
      tickets.forEach((ticket, i) => {
        if (ticket.status === 'error') {
          errors.push(ticket.details?.error ?? ticket.message ?? 'unknown');
          if (ticket.details?.error === 'DeviceNotRegistered') dead.push(batch[i].to);
        }
      });
      if (dead.length > 0) {
        await prisma.pushToken.deleteMany({ where: { token: { in: dead } } }).catch(() => {});
      }
    }
    return { tokens: tokens.length, errors };
  } catch (err) {
    console.error('deliverPush error:', err instanceof Error ? err.message : err);
    errors.push(err instanceof Error ? err.message : String(err));
    return { tokens: 0, errors };
  }
}

/**
 * Push till den aktiva handlaren när någon ANNAN lägger in varor medan
 * "Jag handlar" är aktivt — så inget saknas när man kommer hem.
 *
 * Varorna BATCHAS i ett 60-sekundersfönster per lista istället för att
 * strypas: fem snabba tillägg blir EN notis med alla namnen ("Mjölk, smör,
 * kaffe lades till …"), och senare tillägg öppnar ett nytt fönster — inget
 * tystas någonsin. Vid flush verifieras att "Jag handlar" fortfarande är
 * aktivt (handlingen kan ha avslutats under fönstret).
 *
 * opts.immediate skickar direkt utan batchning — används av veckomeny-
 * transfern som redan är en sammanfattning ("12 varor från veckomenyn").
 * Lokala profiler (utan clerkUserId) kan inte pushas. Fire-and-forget —
 * får aldrig fälla requesten som triggade den.
 */
// 30s — hinner samla en skur av tillägg utan att handlaren hunnit passera
// hyllan varorna finns på (60s kändes för långsamt i butik).
const SHOPPER_ITEM_DEBOUNCE_MS = 30_000;
const shopperItemBuffers = new Map<string, { names: string[]; timer: NodeJS.Timeout }>();

function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

async function resolveActiveShopper(
  activeShopperMemberId: string | null,
  excludeClerkUserId?: string,
): Promise<string | null> {
  if (!activeShopperMemberId) return null;
  const shopper = await prisma.householdMember.findUnique({
    where: { id: activeShopperMemberId },
    select: { clerkUserId: true },
  });
  if (!shopper?.clerkUserId || shopper.clerkUserId === excludeClerkUserId) return null;
  return shopper.clerkUserId;
}

async function flushShopperItemBuffer(listId: string): Promise<void> {
  const buf = shopperItemBuffers.get(listId);
  shopperItemBuffers.delete(listId);
  if (!buf || buf.names.length === 0) return;

  // Färsk läsning — handlingen kan ha avslutats/bytt person under fönstret.
  const list = await prisma.shoppingList.findUnique({
    where: { id: listId },
    select: { id: true, name: true, activeShopperMemberId: true },
  });
  if (!list) return;
  const shopperClerkId = await resolveActiveShopper(list.activeShopperMemberId);
  if (!shopperClerkId) return;

  const shown = buf.names.slice(0, 6).join(', ');
  const rest = buf.names.length - 6;
  const label = capitalizeFirst(shown) + (rest > 0 ? ` +${rest} till` : '');
  await sendPush([shopperClerkId], 'shopperItemAdded', {
    title: buf.names.length === 1 ? 'Ny vara på listan' : `${buf.names.length} nya varor på listan`,
    body: `${label} lades till i "${list.name}" medan du handlar`,
    data: { type: 'shopperItemAdded', listId: list.id },
  });
}

export async function notifyActiveShopper(
  list: { id: string; name: string; activeShopperMemberId: string | null },
  adderClerkUserId: string,
  itemLabel: string,
  opts?: { immediate?: boolean },
): Promise<void> {
  const shopperClerkId = await resolveActiveShopper(list.activeShopperMemberId, adderClerkUserId);
  if (!shopperClerkId) return;

  if (opts?.immediate) {
    await sendPush([shopperClerkId], 'shopperItemAdded', {
      title: 'Nya varor på listan',
      body: `${capitalizeFirst(itemLabel)} lades till i "${list.name}" medan du handlar`,
      data: { type: 'shopperItemAdded', listId: list.id },
    });
    return;
  }

  const existing = shopperItemBuffers.get(list.id);
  if (existing) {
    existing.names.push(itemLabel);
    return;
  }
  shopperItemBuffers.set(list.id, {
    names: [itemLabel],
    timer: setTimeout(() => { flushShopperItemBuffer(list.id).catch(() => {}); }, SHOPPER_ITEM_DEBOUNCE_MS),
  });
}

/**
 * Returns true at most once for a given dedupeKey by inserting a NotificationLog
 * row. Used by the scheduler so a time-based reminder fires once per occurrence
 * even though the scheduler runs every minute.
 */
export async function claimNotification(dedupeKey: string): Promise<boolean> {
  // createMany + skipDuplicates inserts at most once and returns the inserted
  // count — no thrown unique-constraint error to pollute the logs.
  const { count } = await prisma.notificationLog.createMany({
    data: [{ dedupeKey }],
    skipDuplicates: true,
  });
  return count > 0;
}
