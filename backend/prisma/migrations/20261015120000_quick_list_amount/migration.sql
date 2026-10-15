-- Snabbvarans egen mängd ("min yoghurt, 1,5 l"), skild från basvarans
-- unit/defaultQuantity som skrivs av annat i appen.
ALTER TABLE "StapleItem" ADD COLUMN "quickQuantity" DOUBLE PRECISION;
ALTER TABLE "StapleItem" ADD COLUMN "quickUnit" TEXT;
