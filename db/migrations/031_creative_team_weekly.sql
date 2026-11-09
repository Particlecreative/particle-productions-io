-- 031_creative_team_weekly.sql — Creative Weekly now holds two decks per week: the founders deck (as before)
-- and the Creative Team Weekly. Same table, one row per deck; existing rows are founders decks.
ALTER TABLE creative_reports ADD COLUMN IF NOT EXISTS deck TEXT NOT NULL DEFAULT 'founders';
ALTER TABLE creative_reports DROP CONSTRAINT IF EXISTS creative_reports_brand_id_week_start_key;
CREATE UNIQUE INDEX IF NOT EXISTS creative_reports_brand_week_deck ON creative_reports (brand_id, week_start, deck);
