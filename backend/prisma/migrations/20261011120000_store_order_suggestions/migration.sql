-- Förslag på kategoriordning på/av per butik (hela hushållet).
ALTER TABLE "Store" ADD COLUMN "orderSuggestions" BOOLEAN NOT NULL DEFAULT true;
