-- Skiljer ett hushålls val av kategori från klassarens gissning när basvaran
-- skapades. null = skapad före 2026-09-30; backfillStapleChoice avgör vid start.
ALTER TABLE "StapleItem" ADD COLUMN "categoryChosen" BOOLEAN;
