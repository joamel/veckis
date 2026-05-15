// Helpers for keeping ScheduleEntry.assignedTo (singular, legacy) and
// assignedToMany (array, multi-user) in sync. Pure functions, no DB.

export interface AssignedToFields {
  assignedTo?: string | null;
  assignedToMany?: string[];
}

/**
 * Normalize incoming patch data so the two fields stay consistent.
 * - If assignedToMany is provided, derive assignedTo = many[0] ?? null
 * - Else if assignedTo is provided, set assignedToMany = [assignedTo] (or [])
 * - Else leave both untouched
 */
export function syncAssignedTo<T extends AssignedToFields>(data: T): T {
  const out = { ...data };
  if (out.assignedToMany !== undefined) {
    out.assignedTo = out.assignedToMany[0] ?? null;
  } else if (out.assignedTo !== undefined) {
    out.assignedToMany = out.assignedTo ? [out.assignedTo] : [];
  }
  return out;
}
