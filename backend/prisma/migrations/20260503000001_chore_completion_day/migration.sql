-- Add optional day field to ChoreCompletion for per-day tracking
ALTER TABLE "ChoreCompletion" ADD COLUMN "day" "WeekDay";
