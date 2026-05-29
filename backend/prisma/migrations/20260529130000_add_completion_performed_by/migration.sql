-- Track who actually did a chore (may be a local profile, distinct from the
-- Clerk-logged user in completedBy who pressed the button). Null = same as completedBy.
ALTER TABLE "ChoreCompletion" ADD COLUMN "performedByMemberId" TEXT;
