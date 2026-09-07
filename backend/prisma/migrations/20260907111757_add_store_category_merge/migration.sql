-- Kategori-ihopslagning per butik: { sourceCategory: targetCategory }.
ALTER TABLE "Store" ADD COLUMN "categoryMerge" JSONB NOT NULL DEFAULT '{}';
