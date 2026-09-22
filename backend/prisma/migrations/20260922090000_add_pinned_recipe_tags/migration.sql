-- Receptlistans fästa taggar per hushåll, i fästordning. Ligger först i
-- taggraden; resten sorteras som förut på antal recept.
ALTER TABLE "Household" ADD COLUMN "pinnedRecipeTags" TEXT[] NOT NULL DEFAULT '{}';
