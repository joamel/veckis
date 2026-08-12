-- Ny parent-kategori "Baby & barn" (baby_kids) i StoreCategory-enumet.
-- Placeras före 'other' för att matcha schema-ordningen.
ALTER TYPE "StoreCategory" ADD VALUE IF NOT EXISTS 'baby_kids' BEFORE 'other';
