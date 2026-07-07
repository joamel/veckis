-- AlterTable: notispreferens för "vara tillagd medan du handlar"
ALTER TABLE "NotificationPreference" ADD COLUMN "shopperItemAdded" BOOLEAN NOT NULL DEFAULT true;
