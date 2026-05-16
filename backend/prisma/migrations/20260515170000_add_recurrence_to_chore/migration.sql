-- AlterTable: add recurrence fields to Chore (mirroring ScheduleEntry)
ALTER TABLE "Chore"
  ADD COLUMN "recurrenceType"        "RecurrenceType" NOT NULL DEFAULT 'none',
  ADD COLUMN "recurrenceWeeks"       INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "monthlyType"           TEXT NOT NULL DEFAULT 'day_of_month',
  ADD COLUMN "recurrenceWeekOfMonth" INTEGER;

-- Backfill recurrenceType from legacy frequency enum
UPDATE "Chore" SET "recurrenceType" = 'daily'   WHERE "frequency" = 'daily';
UPDATE "Chore" SET "recurrenceType" = 'weekly'  WHERE "frequency" = 'weekly';
UPDATE "Chore" SET "recurrenceType" = 'weekly', "recurrenceWeeks" = 2 WHERE "frequency" = 'biweekly';
UPDATE "Chore" SET "recurrenceType" = 'monthly' WHERE "frequency" = 'monthly';
-- 'once' stays as 'none' (default)
