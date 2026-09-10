-- Löpande AI-kostnad per kalendermånad.
-- Ligger i databasen och inte i processminnet: Railway deployar ofta, och en
-- minnesräknare hade nollställts varje gång.
CREATE TABLE "AiUsage" (
    "month" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costOre" INTEGER NOT NULL DEFAULT 0,
    "warnedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("month")
);
