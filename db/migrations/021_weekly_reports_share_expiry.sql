-- 021_weekly_reports_share_expiry.sql
-- weekly_reports.share_expires_at is read/written by routes/weeklyReports.js but was never created
-- by a migration. No-op where it already exists; existing rows stay NULL (= never expires).
ALTER TABLE weekly_reports ADD COLUMN IF NOT EXISTS share_expires_at TIMESTAMPTZ;
