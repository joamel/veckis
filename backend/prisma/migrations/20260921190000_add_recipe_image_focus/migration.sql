-- Vilken del av receptbilden som ska synas när den beskärs till 16:9 vid
-- visning. 0 = vänster/överkant, 1 = höger/nederkant, NULL = mitten.
--
-- Lagras i stället för att beskära filen: originalet blir kvar, justeringen
-- går att ändra om, och den fungerar även för URL-importerade bilder som
-- ligger hos tredje part och inte kan beskäras av oss.
ALTER TABLE "Recipe" ADD COLUMN "imageFocusX" DOUBLE PRECISION;
ALTER TABLE "Recipe" ADD COLUMN "imageFocusY" DOUBLE PRECISION;
