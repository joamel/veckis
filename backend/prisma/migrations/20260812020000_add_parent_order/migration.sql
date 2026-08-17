-- Enhetlig parent-ordning (standard + egna kategorier) i en lista.
ALTER TABLE "Store" ADD COLUMN "parentOrder" TEXT[] DEFAULT ARRAY[]::TEXT[];
