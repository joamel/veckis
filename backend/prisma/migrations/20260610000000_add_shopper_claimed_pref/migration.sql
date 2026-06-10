ALTER TABLE "NotificationPreference" ADD COLUMN IF NOT EXISTS "shopperClaimed" BOOLEAN NOT NULL DEFAULT true;
