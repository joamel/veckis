import { prisma } from '../db';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/** Preference keys on NotificationPreference — one per notification type. */
export type NotificationType = 'activityReminder' | 'choreOverdue' | 'listCleared' | 'newMember';

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
  try {
    const userIds = [...new Set(clerkUserIds)].filter(Boolean);
    if (userIds.length === 0) return;

    // Drop users who opted out of this notification type.
    const prefs = await prisma.notificationPreference.findMany({
      where: { clerkUserId: { in: userIds } },
    });
    const optedOut = new Set(prefs.filter(p => !p[type]).map(p => p.clerkUserId));
    const recipients = userIds.filter(id => !optedOut.has(id));
    if (recipients.length === 0) return;

    const tokens = await prisma.pushToken.findMany({
      where: { clerkUserId: { in: recipients } },
      select: { token: true },
    });
    if (tokens.length === 0) return;

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
        console.error('Expo push failed:', res.status, await res.text().catch(() => ''));
        continue;
      }
      const json = (await res.json().catch(() => null)) as { data?: ExpoTicket[] } | null;
      const tickets = json?.data ?? [];
      // Prune tokens Expo says are no longer valid for a device.
      const dead: string[] = [];
      tickets.forEach((ticket, i) => {
        if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
          dead.push(batch[i].to);
        }
      });
      if (dead.length > 0) {
        await prisma.pushToken.deleteMany({ where: { token: { in: dead } } }).catch(() => {});
      }
    }
  } catch (err) {
    console.error('sendPush error:', err instanceof Error ? err.message : err);
  }
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
