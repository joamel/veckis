-- CreateTable
CREATE TABLE "MenuTemplate" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MenuTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuTemplateItem" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "day" "WeekDay",

    CONSTRAINT "MenuTemplateItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MenuTemplate_householdId_idx" ON "MenuTemplate"("householdId");

-- CreateIndex
CREATE INDEX "MenuTemplateItem_templateId_idx" ON "MenuTemplateItem"("templateId");

-- AddForeignKey
ALTER TABLE "MenuTemplate" ADD CONSTRAINT "MenuTemplate_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuTemplateItem" ADD CONSTRAINT "MenuTemplateItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MenuTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuTemplateItem" ADD CONSTRAINT "MenuTemplateItem_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
