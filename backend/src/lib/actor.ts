import { prisma } from '../db';

/**
 * Resolve a household member's display name for stamping realtime events with
 * who triggered them (L35 conflict warning). Returns undefined when no
 * membership row exists. Best-effort — never throws.
 */
export async function actorName(householdId: string, clerkUserId: string): Promise<string | undefined> {
  try {
    const member = await prisma.householdMember.findUnique({
      where: { householdId_clerkUserId: { householdId, clerkUserId } },
      select: { displayName: true },
    });
    return member?.displayName ?? undefined;
  } catch {
    return undefined;
  }
}
