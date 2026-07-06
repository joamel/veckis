-- AlterTable: recept-taggar ("vegetariskt", "snabbt", "favorit", …)
ALTER TABLE "Recipe" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT '{}';
