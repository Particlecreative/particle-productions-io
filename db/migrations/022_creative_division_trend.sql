-- 022_creative_division_trend.sql — Creative Weekly v2: 8-week trend per division (Design / Video / TV & SP).
-- Additive; rows without by_division are recomputed on the next generate.
ALTER TABLE creative_week_stats ADD COLUMN IF NOT EXISTS by_division JSONB;
