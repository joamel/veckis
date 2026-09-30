-- Egna underkategorier tas bort: underkategorier är alltid standard (taxonomin),
-- så inlärning, butiksförslag och kategoriväljaren kan lita på dem.
--
-- Varor i en egen underkategori faller tillbaka till sin kategori. De saknar
-- standard-sub (den hoppades över vid lokal placering); backfillSubCategory
-- gissar fram en vid nästa start. Kolumnerna står kvar tills vidare — bara
-- värdena nollas. Bockhändelsernas historik (ShoppingCheckEvent) rörs inte.
UPDATE "ShoppingItem" SET "customSubCategory" = NULL WHERE "customSubCategory" IS NOT NULL;

-- Butikernas register över egna underkategorier och deras "cs:"-nycklar i
-- ordningarna. En "cs:"-nyckel som blev kvar i parentOrder skulle annars
-- tolkas som en kategori.
UPDATE "Store" SET
  "customSubs"   = '{}'::jsonb,
  "expandedSubs" = ARRAY(SELECT k FROM unnest("expandedSubs") AS k WHERE k NOT LIKE 'cs:%'),
  "subOrder"     = ARRAY(SELECT k FROM unnest("subOrder") AS k WHERE k NOT LIKE 'cs:%'),
  "parentOrder"  = ARRAY(SELECT k FROM unnest("parentOrder") AS k WHERE k NOT LIKE 'cs:%')
WHERE "customSubs"::text <> '{}'
   OR EXISTS (SELECT 1 FROM unnest("expandedSubs" || "subOrder" || "parentOrder") AS k WHERE k LIKE 'cs:%');
