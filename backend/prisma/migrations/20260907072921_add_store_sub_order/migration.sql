-- Ordning för icke-utbrutna standard-subs (så hushållet kan sortera innan man visar dem).
ALTER TABLE "Store" ADD COLUMN "subOrder" TEXT[] DEFAULT ARRAY[]::TEXT[];
