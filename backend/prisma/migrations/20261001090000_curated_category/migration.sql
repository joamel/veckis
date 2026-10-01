-- Handskrivna klassningar från adminsidan (se CuratedCategory i schemat).
CREATE TABLE "CuratedCategory" (
    "name" TEXT NOT NULL,
    "category" "StoreCategory" NOT NULL,
    "subCategory" TEXT,
    "updatedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CuratedCategory_pkey" PRIMARY KEY ("name")
);
