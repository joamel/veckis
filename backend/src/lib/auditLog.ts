// Auditspår för känsliga handlingar. Skriver till AuditLog-tabellen
// utan att kasta — en log-write som failar ska aldrig blockera den
// faktiska handlingen, men det ska synas i konsolen så vi kan reagera.
//
// Loggas (idag):
// - household.delete   — admin tog bort ett hushåll
// - household.update   — admin ändrade namn/emoji
// - member.remove      — admin tog bort en medlem
// - member.role_change — admin gav/tog admin
// - invite.create      — någon genererade en invite-kod
//
// Snapshots av target-namn lagras i raden så att även när själva entiteten
// är raderad kan vi se vad som hände.
import { prisma } from '../db';

export interface AuditEvent {
  householdId?: string | null;
  actorClerkUserId: string;
  actorName?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  targetName?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function audit(event: AuditEvent): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        householdId: event.householdId ?? null,
        actorClerkUserId: event.actorClerkUserId,
        actorName: event.actorName ?? null,
        action: event.action,
        targetType: event.targetType ?? null,
        targetId: event.targetId ?? null,
        targetName: event.targetName ?? null,
        metadata: event.metadata ? (event.metadata as object) : undefined,
      },
    });
  } catch (err) {
    // Aldrig krascha en användarhandling pga audit-write. Men logga tydligt
    // så vi ser om audit-tabellen är trasig.
    console.error('[AUDIT] Failed to write log:', err instanceof Error ? err.message : err, 'event:', event);
  }
}

/** Slå upp actor's displayName i hushållet en gång så vi kan snapshot:a det. */
export async function lookupActorName(householdId: string, clerkUserId: string): Promise<string | null> {
  try {
    const m = await prisma.householdMember.findUnique({
      where: { householdId_clerkUserId: { householdId, clerkUserId } },
      select: { displayName: true },
    });
    return m?.displayName ?? null;
  } catch {
    return null;
  }
}
