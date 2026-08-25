-- Fimpar Kalender + Sysslor + lokala profiler (irreversibel full radering).
-- Kärn-loopen är nu recept -> veckomeny -> inköpslista; Chore/ScheduleEntry och
-- passiva lokala medlemmar (HouseholdMember utan clerkUserId) är död vikt.

-- Data-purge: ta bort lokala profiler. Deras chore/schedule-tilldelningar
-- försvinner ändå när tabellerna droppas nedan. HouseholdMember-modellen behålls
-- (används av menyn), så raderna måste tas bort explicit.
DELETE FROM "HouseholdMember" WHERE "clerkUserId" IS NULL;

-- DropForeignKey
ALTER TABLE "Chore" DROP CONSTRAINT "Chore_householdId_fkey";

-- DropForeignKey
ALTER TABLE "ChoreCompletion" DROP CONSTRAINT "ChoreCompletion_choreId_fkey";

-- DropForeignKey
ALTER TABLE "ScheduleEntry" DROP CONSTRAINT "ScheduleEntry_householdId_fkey";

-- AlterTable
ALTER TABLE "NotificationPreference" DROP COLUMN "activityReminder",
DROP COLUMN "choreCompleted",
DROP COLUMN "choreOverdue",
DROP COLUMN "reminderMinutes";

-- DropTable
DROP TABLE "Chore";

-- DropTable
DROP TABLE "ChoreCompletion";

-- DropTable
DROP TABLE "ScheduleEntry";

-- DropEnum
DROP TYPE "ChoreFrequency";

-- DropEnum
DROP TYPE "RecurrenceType";
