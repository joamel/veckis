-- Lägg till två nya parents i StoreCategory-enum:en (Chark & deli + Specialkost)
-- och en ny kolumn ShoppingItem.subCategory som källa-till-sanning för
-- 2-nivå-taxonomin. customCategory behålls för bakåtkompatibilitet och
-- migreras separat i en senare punkt.

ALTER TYPE "StoreCategory" ADD VALUE IF NOT EXISTS 'deli_charcuterie';
ALTER TYPE "StoreCategory" ADD VALUE IF NOT EXISTS 'special_diet';

ALTER TABLE "ShoppingItem" ADD COLUMN "subCategory" TEXT;
