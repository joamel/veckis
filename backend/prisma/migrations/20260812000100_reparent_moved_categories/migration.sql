-- Flytta befintliga varor till de korrigerade default-parentsen efter taxonomi-
-- reviewen. Endast där varan fortfarande ligger på den GAMLA (fel) default-
-- parenten — medvetna egna placeringar (annan category) lämnas orörda.

-- Kaffe & te: Drycker -> Torrvaror
UPDATE "ShoppingItem" SET "category" = 'canned_dry'
  WHERE "subCategory" IN ('kaffe', 'te') AND "category" = 'beverages';

-- Baby & barn: Övrigt -> egen parent baby_kids
UPDATE "ShoppingItem" SET "category" = 'baby_kids'
  WHERE "subCategory" = 'baby_barn' AND "category" = 'other';
