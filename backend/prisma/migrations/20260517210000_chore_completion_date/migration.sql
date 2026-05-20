-- Add date (YYYY-MM-DD) column to ChoreCompletion so completions are bound to a specific
-- calendar day rather than just a WeekDay enum (which caused all instances of e.g. "Monday"
-- to appear checked when one Monday was completed).
ALTER TABLE "ChoreCompletion" ADD COLUMN "date" TEXT;

-- Backfill: derive date from completedAt for existing rows.
UPDATE "ChoreCompletion"
SET "date" = TO_CHAR("completedAt", 'YYYY-MM-DD')
WHERE "date" IS NULL;
