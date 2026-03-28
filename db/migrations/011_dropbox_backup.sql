-- Add Dropbox backup tracking columns to settings
ALTER TABLE settings ADD COLUMN IF NOT EXISTS dropbox_backup_at TIMESTAMPTZ;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS dropbox_backup_stats JSONB;
