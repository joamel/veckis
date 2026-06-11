-- Convert remindMinutes from nullable Int to Int[] array.
-- NULL → empty array, existing value → single-element array.
ALTER TABLE "ScheduleEntry"
  ALTER COLUMN "remindMinutes" TYPE INTEGER[]
  USING CASE
    WHEN "remindMinutes" IS NULL THEN ARRAY[]::INTEGER[]
    ELSE ARRAY["remindMinutes"]
  END;
ALTER TABLE "ScheduleEntry" ALTER COLUMN "remindMinutes" SET DEFAULT ARRAY[]::INTEGER[];
ALTER TABLE "ScheduleEntry" ALTER COLUMN "remindMinutes" SET NOT NULL;
