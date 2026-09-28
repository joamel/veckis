-- Dubbletter som hann skapas innan regeln fanns: den ÄLDSTA butiken per
-- hushåll och bankbutik behåller kopplingen, de övriga blir egna butiker
-- igen. Inget raderas — namn, ordning och listor är kvar.
UPDATE "Store" s
SET "sharedStoreId" = NULL
WHERE s."sharedStoreId" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "Store" o
    WHERE o."householdId" = s."householdId"
      AND o."sharedStoreId" = s."sharedStoreId"
      AND (o."createdAt" < s."createdAt" OR (o."createdAt" = s."createdAt" AND o."id" < s."id"))
  );

-- CreateIndex
CREATE UNIQUE INDEX "Store_householdId_sharedStoreId_key" ON "Store"("householdId", "sharedStoreId");
