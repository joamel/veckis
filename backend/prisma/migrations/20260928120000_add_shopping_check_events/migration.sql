-- CreateTable
CREATE TABLE "ShoppingCheckEvent" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "shopperKey" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subCategory" TEXT,
    "customCategory" TEXT,
    "customSubCategory" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL,
    "bulk" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShoppingCheckEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShoppingCheckEvent_storeId_checkedAt_idx" ON "ShoppingCheckEvent"("storeId", "checkedAt");

-- AddForeignKey
ALTER TABLE "ShoppingCheckEvent" ADD CONSTRAINT "ShoppingCheckEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
