-- AlterTable: replace single day with days array on Chore
ALTER TABLE "Chore" ADD COLUMN "days" "WeekDay"[] NOT NULL DEFAULT ARRAY[]::"WeekDay"[];

-- Migrate existing single day value into array
UPDATE "Chore" SET "days" = ARRAY["day"::"WeekDay"] WHERE "day" IS NOT NULL;

-- Drop old column
ALTER TABLE "Chore" DROP COLUMN "day";
