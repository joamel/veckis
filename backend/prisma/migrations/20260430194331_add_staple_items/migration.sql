-- CreateTable
CREATE TABLE "StapleItem" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "StoreCategory" NOT NULL DEFAULT 'other',
    "unit" TEXT,
    "defaultQuantity" DOUBLE PRECISION,

    CONSTRAINT "StapleItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StapleItem_householdId_idx" ON "StapleItem"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "StapleItem_householdId_name_key" ON "StapleItem"("householdId", "name");

-- AddForeignKey
ALTER TABLE "StapleItem" ADD CONSTRAINT "StapleItem_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
