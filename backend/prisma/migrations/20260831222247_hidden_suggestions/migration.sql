-- CreateTable
CREATE TABLE "HiddenSuggestion" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HiddenSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HiddenSuggestion_householdId_idx" ON "HiddenSuggestion"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "HiddenSuggestion_householdId_name_key" ON "HiddenSuggestion"("householdId", "name");

-- AddForeignKey
ALTER TABLE "HiddenSuggestion" ADD CONSTRAINT "HiddenSuggestion_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

