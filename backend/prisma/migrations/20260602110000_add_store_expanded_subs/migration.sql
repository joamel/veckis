-- Store.expandedSubs: subs som hushållet vill se som egna sektioner i listan
-- (istället för att samlas under parent-kategorin).
ALTER TABLE "Store" ADD COLUMN "expandedSubs" TEXT[] NOT NULL DEFAULT '{}';
