-- Snabblistan: hushållets egna snabbvaror, och om en lista visar dem.
ALTER TABLE "StapleItem" ADD COLUMN "inQuickList" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ShoppingList" ADD COLUMN "showQuickList" BOOLEAN NOT NULL DEFAULT true;
