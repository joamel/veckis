-- CreateEnum
CREATE TYPE "RecurrenceType" AS ENUM ('none', 'daily', 'weekly', 'custom_days', 'monthly');

-- AlterTable
ALTER TABLE "ScheduleEntry" ADD COLUMN "recurrenceType" "RecurrenceType" NOT NULL DEFAULT 'none',
ADD COLUMN "recurrenceDays" "WeekDay"[] DEFAULT ARRAY[]::"WeekDay"[];
