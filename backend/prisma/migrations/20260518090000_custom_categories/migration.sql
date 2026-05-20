-- Store: gain customCategories (user-defined labels usable in shopping lists of this store)
ALTER TABLE "Store" ADD COLUMN "customCategories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- ShoppingItem: customCategory overrides the enum `category` for grouping when set
ALTER TABLE "ShoppingItem" ADD COLUMN "customCategory" TEXT;
