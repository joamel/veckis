-- Total tillagningstid i minuter som receptet självt anger. NULL = okänd —
-- hellre inget chip än en gissad tid.
ALTER TABLE "Recipe" ADD COLUMN "cookMinutes" INTEGER;
