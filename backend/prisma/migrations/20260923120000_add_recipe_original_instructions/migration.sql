-- Tillagningsstegen som källan skrev dem, satt bara när importen översatte
-- texten. NULL = receptet var redan svenskt eller skrevs för hand.
ALTER TABLE "Recipe" ADD COLUMN "originalInstructions" TEXT;
