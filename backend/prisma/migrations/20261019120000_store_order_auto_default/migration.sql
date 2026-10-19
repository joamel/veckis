-- Automatisk ordning blir standard: ett reglage i appen styr både förslag och
-- automatik. Butiker där förslagen var på får automatiken; avstängda förblir av.
ALTER TABLE "Store" ALTER COLUMN "orderAutoApply" SET DEFAULT true;
UPDATE "Store" SET "orderAutoApply" = "orderSuggestions";
