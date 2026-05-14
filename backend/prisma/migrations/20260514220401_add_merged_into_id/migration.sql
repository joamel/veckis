-- AlterTable
ALTER TABLE "ShoppingItem" ADD COLUMN     "mergedIntoId" TEXT;

-- CreateIndex
CREATE INDEX "ShoppingItem_mergedIntoId_idx" ON "ShoppingItem"("mergedIntoId");

-- AddForeignKey
ALTER TABLE "ShoppingItem" ADD CONSTRAINT "ShoppingItem_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "ShoppingItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
