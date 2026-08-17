-- Hushålls-lokala egna underkategorier + item-etikett.
ALTER TABLE "ShoppingItem" ADD COLUMN "customSubCategory" TEXT;
ALTER TABLE "Store" ADD COLUMN "customSubs" JSONB NOT NULL DEFAULT '{}';
