-- När varan bockades av — så snabblistan kan föreslå det som just handlats.
ALTER TABLE "ShoppingItem" ADD COLUMN "checkedAt" TIMESTAMP(3);
