-- CreateTable
CREATE TABLE "IngredientAliasHousehold" (
    "raw" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngredientAliasHousehold_pkey" PRIMARY KEY ("raw","householdId")
);
