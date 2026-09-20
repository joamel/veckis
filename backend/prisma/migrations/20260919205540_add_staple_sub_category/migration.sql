-- Hushållets val av underkategori för en basvara. Nullbart: befintliga rader
-- har inget val gjort, och då gissar inferSubCategory som tidigare.
ALTER TABLE "StapleItem" ADD COLUMN "subCategory" TEXT;
