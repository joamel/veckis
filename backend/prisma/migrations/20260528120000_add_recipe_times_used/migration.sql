-- AlterTable
ALTER TABLE "Recipe" ADD COLUMN "timesUsed" INTEGER NOT NULL DEFAULT 0;

-- Backfill from current menu placements so "most used" is meaningful immediately.
UPDATE "Recipe" SET "timesUsed" = (
  SELECT COUNT(*) FROM "WeekMenuItem" WHERE "WeekMenuItem"."recipeId" = "Recipe"."id"
);
