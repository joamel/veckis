-- CreateTable
CREATE TABLE "IngredientAlias" (
    "raw" TEXT NOT NULL,
    "canonical" TEXT NOT NULL,
    "category" "StoreCategory" NOT NULL DEFAULT 'other',
    "seenCount" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "IngredientAlias_pkey" PRIMARY KEY ("raw")
);

-- CreateIndex
CREATE INDEX "IngredientAlias_canonical_idx" ON "IngredientAlias"("canonical");
