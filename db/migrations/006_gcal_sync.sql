-- Migration: Add Google Calendar sync columns
ALTER TABLE gantt_events ADD COLUMN IF NOT EXISTS gcal_event_id TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS gcal_calendar_id TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS gcal_sync_token TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS gcal_last_sync TIMESTAMPTZ;
