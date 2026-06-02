-- "Jag handlar"-presence: vem som aktivt handlar listan just nu.
ALTER TABLE "ShoppingList"
  ADD COLUMN "activeShopperMemberId" TEXT,
  ADD COLUMN "activeShopperSince"    TIMESTAMP(3);
