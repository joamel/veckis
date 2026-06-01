-- Add multi-assign + rotation to Chore. assignedTo behålls för bakåtkompatibilitet
-- och hålls i sync med assignedToMany via syncAssignedTo i app-koden.
ALTER TABLE "Chore"
  ADD COLUMN "assignedToMany" TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN "rotation"       BOOLEAN NOT NULL DEFAULT false;

-- Backfill: alla rader med en assignedTo blir [assignedTo].
UPDATE "Chore"
SET    "assignedToMany" = ARRAY["assignedTo"]
WHERE  "assignedTo" IS NOT NULL;
