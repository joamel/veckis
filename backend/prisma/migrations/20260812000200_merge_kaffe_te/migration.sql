-- Slå ihop underkategorierna kaffe + te → kaffe_te.
UPDATE "ShoppingItem" SET "subCategory" = 'kaffe_te'
  WHERE "subCategory" IN ('kaffe', 'te');
