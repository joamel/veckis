-- Add emoji column to Chore and ScheduleEntry
ALTER TABLE "Chore" ADD COLUMN "emoji" TEXT;
ALTER TABLE "ScheduleEntry" ADD COLUMN "emoji" TEXT;
