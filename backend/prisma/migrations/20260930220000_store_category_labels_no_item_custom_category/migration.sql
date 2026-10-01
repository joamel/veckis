-- Butikens egna namn på kategorier och rubriker ("Skafferi" på ICA).
ALTER TABLE "Store" ADD COLUMN "categoryLabels" JSONB NOT NULL DEFAULT '{}';

-- Egna kategorier på varan tas bort: en vara hör alltid till en
-- standardkategori, och egna kategorier är butikens rubriker (c:-nycklar i
-- parentOrder), där man samlar utlyfta underkategorier. Varorna faller tillbaka
-- till sin standardkategori (fältet "category" har alltid haft en); saknar de
-- underkategori gissar backfillSubCategory fram en vid nästa start. Rubrikerna
-- står kvar i butikerna. Bockhistoriken rörs inte.
UPDATE "ShoppingItem" SET "customCategory" = NULL WHERE "customCategory" IS NOT NULL;
