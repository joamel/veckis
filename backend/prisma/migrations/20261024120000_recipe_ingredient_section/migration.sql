-- Underrubrik i receptet ("Deg", "Sås"): samma vara kan stå under flera.
ALTER TABLE "RecipeIngredient" ADD COLUMN "section" TEXT;
