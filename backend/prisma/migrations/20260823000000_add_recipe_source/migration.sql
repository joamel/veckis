-- Källa för hur receptet skapades: 'manual' | 'ai_paste' | 'url_import'.
-- Default 'manual' → befintliga recept behandlas som egna (delningsbara).
ALTER TABLE "Recipe" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'manual';
