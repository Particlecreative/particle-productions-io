-- Sync script_comments with columns the app already relies on (threaded replies +
-- system-generated notes). These exist on production already; this brings fresh
-- environments and the repo schema in line. Safe/no-op where columns exist.

ALTER TABLE script_comments
  ADD COLUMN IF NOT EXISTS parent_comment_id UUID REFERENCES script_comments(id) ON DELETE CASCADE;

ALTER TABLE script_comments
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_script_comments_parent_id ON script_comments(parent_comment_id);
CREATE INDEX IF NOT EXISTS idx_script_comments_status ON script_comments(status);
