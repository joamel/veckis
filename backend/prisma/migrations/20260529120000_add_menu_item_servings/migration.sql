-- Per-placement portion scaling for week menu items; null = use recipe default.
ALTER TABLE "WeekMenuItem" ADD COLUMN "servings" INTEGER;
