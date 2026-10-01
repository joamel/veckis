-- Varunamn dolda för andra hushåll, och städförslag adminen valt bort.
CREATE TABLE "HiddenGlobalName" (
    "name" TEXT NOT NULL,
    "hiddenBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HiddenGlobalName_pkey" PRIMARY KEY ("name")
);

CREATE TABLE "IgnoredSuggestion" (
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IgnoredSuggestion_pkey" PRIMARY KEY ("scope","key")
);
