-- Chat-based Taxi Wizard: persist the conversation + generated transport plan
-- per production so it reopens where you left off.
ALTER TABLE productions ADD COLUMN IF NOT EXISTS taxi_plan JSONB;
