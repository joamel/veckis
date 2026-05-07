-- AlterEnum
ALTER TYPE "RecurrenceType" ADD VALUE 'yearly';

-- AlterTable
ALTER TABLE "ScheduleEntry" ADD COLUMN     "monthlyType" TEXT NOT NULL DEFAULT 'day_of_month',
ADD COLUMN     "recurrenceWeekOfMonth" INTEGER;
