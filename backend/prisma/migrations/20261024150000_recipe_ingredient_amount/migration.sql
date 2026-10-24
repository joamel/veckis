-- "3–4 dl" och "ca 13 dl": receptets egen formulering sparas, inte bara talet.
ALTER TABLE "RecipeIngredient" ADD COLUMN "quantityMin" DOUBLE PRECISION;
ALTER TABLE "RecipeIngredient" ADD COLUMN "qualifier" TEXT;
