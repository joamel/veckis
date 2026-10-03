-- Snabbrätt: veckomenyrad med bara ett namn, utan recept.
ALTER TABLE "WeekMenuItem" ALTER COLUMN "recipeId" DROP NOT NULL;
ALTER TABLE "WeekMenuItem" ADD COLUMN "title" TEXT;
