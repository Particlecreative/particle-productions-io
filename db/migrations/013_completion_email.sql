-- Add completion_email_sent_at to contracts
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS completion_email_sent_at TIMESTAMPTZ;
-- Add additional_files for multi-file upload support
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS additional_files JSONB DEFAULT '[]';
ALTER TABLE production_line_items ADD COLUMN IF NOT EXISTS additional_files JSONB DEFAULT '[]';
