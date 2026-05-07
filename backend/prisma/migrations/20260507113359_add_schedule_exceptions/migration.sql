-- AlterTable
ALTER TABLE "Chore" ALTER COLUMN "days" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ScheduleEntry" ADD COLUMN     "exceptions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ALTER COLUMN "recurrenceDays" DROP DEFAULT;
