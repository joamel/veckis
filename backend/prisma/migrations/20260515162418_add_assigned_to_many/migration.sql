-- AlterTable
ALTER TABLE "ScheduleEntry" ADD COLUMN     "assignedToMany" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Backfill: copy existing single assignedTo into the new array column
UPDATE "ScheduleEntry" SET "assignedToMany" = ARRAY["assignedTo"] WHERE "assignedTo" IS NOT NULL;
