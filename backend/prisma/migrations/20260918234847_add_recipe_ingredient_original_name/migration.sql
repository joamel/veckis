-- Källans ingrediensnamn, sparat när importen översatte namnet till svenska.
-- Nullbart: allt som redan fanns, och allt som skrivs in för hand, saknar det.
ALTER TABLE "RecipeIngredient" ADD COLUMN "originalName" TEXT;
