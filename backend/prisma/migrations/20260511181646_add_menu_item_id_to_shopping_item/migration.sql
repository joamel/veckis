-- AlterTable
ALTER TABLE "ShoppingItem" ADD COLUMN     "menuItemId" TEXT;

-- CreateIndex
CREATE INDEX "ShoppingItem_menuItemId_idx" ON "ShoppingItem"("menuItemId");
