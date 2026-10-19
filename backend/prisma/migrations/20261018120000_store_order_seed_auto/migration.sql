-- Startordning per butik/kedja/format och automatisk inlärd ordning.
ALTER TABLE "Store" ADD COLUMN "orderAutoApply" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Store" ADD COLUMN "orderAutoUndone" TEXT;
ALTER TABLE "Store" ADD COLUMN "orderSource" TEXT NOT NULL DEFAULT 'default';
ALTER TABLE "Store" ADD COLUMN "orderSeedLabel" TEXT;

-- Butiker som redan sorterats räknas som hushållets egen ordning — de är
-- underlaget för startordningen, och raden i listan ska inte kalla dem standard.
UPDATE "Store" SET "orderSource" = 'custom' WHERE cardinality("parentOrder") > 0;
