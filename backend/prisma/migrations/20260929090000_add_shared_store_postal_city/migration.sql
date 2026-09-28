-- Postorten ur OSM, skild från orten som visas (stadsdel i storstäderna).
ALTER TABLE "SharedStore" ADD COLUMN "postalCity" TEXT;
