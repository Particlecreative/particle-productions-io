-- Casting automation: add automation_last_run to casting table (optional per-row tracking)
ALTER TABLE casting ADD COLUMN IF NOT EXISTS automation_last_run TIMESTAMPTZ;

-- Ensure app_config has a row for casting automation last run
INSERT INTO app_config (key, value) VALUES ('casting_automation_last_run', '')
ON CONFLICT (key) DO NOTHING;
