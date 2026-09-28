-- AlterTable
ALTER TABLE "Store" ADD COLUMN "sharedStoreId" TEXT;

-- CreateTable
CREATE TABLE "SharedStore" (
    "id" TEXT NOT NULL,
    "osmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "chain" TEXT,
    "street" TEXT,
    "postcode" TEXT,
    "city" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SharedStore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SharedStore_osmId_key" ON "SharedStore"("osmId");

-- CreateIndex
CREATE INDEX "Store_sharedStoreId_idx" ON "Store"("sharedStoreId");

-- AddForeignKey
ALTER TABLE "Store" ADD CONSTRAINT "Store_sharedStoreId_fkey" FOREIGN KEY ("sharedStoreId") REFERENCES "SharedStore"("id") ON DELETE SET NULL ON UPDATE CASCADE;
