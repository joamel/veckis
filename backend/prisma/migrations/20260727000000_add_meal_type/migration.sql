-- AlterTable: valfri måltidstyp så flera rätter kan samsas på samma dag
ALTER TABLE "WeekMenuItem" ADD COLUMN "mealType" TEXT;
