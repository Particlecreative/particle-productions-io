-- 017_finance_sheet.sql
-- Per-production Google Sheet finance mirror: store the linked sheet's id + url.
-- The CP is the source of truth; the sheet is a one-way read-only mirror.
-- finance_sheet_synced_at records the last successful CP -> Sheet push.

ALTER TABLE productions ADD COLUMN IF NOT EXISTS finance_sheet_id        TEXT;
ALTER TABLE productions ADD COLUMN IF NOT EXISTS finance_sheet_url       TEXT;
ALTER TABLE productions ADD COLUMN IF NOT EXISTS finance_sheet_synced_at TIMESTAMPTZ;
-- 'mirror' = CP-owned auto-mirror; 'linked' = an existing external sheet linked read-only (no overwrite)
ALTER TABLE productions ADD COLUMN IF NOT EXISTS finance_sheet_mode      TEXT;
