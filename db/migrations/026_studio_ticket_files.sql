-- 026_studio_ticket_files.sql — files added in the AI ticket creator: read by Claude for the brief and/or attached
-- to the Monday ticket. Kept 14 days (pruned on upload); the API container has no disk of its own.
CREATE TABLE IF NOT EXISTS studio_ticket_files (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  mime          TEXT NOT NULL,
  size          INTEGER NOT NULL,
  kind          TEXT NOT NULL,            -- image | pdf | docx | text | video | other
  bytes         BYTEA NOT NULL,
  text_content  TEXT,                     -- extracted text (Word, text files)
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE studio_ticket_files ALTER COLUMN bytes SET STORAGE EXTERNAL;
CREATE INDEX IF NOT EXISTS idx_studio_ticket_files_created ON studio_ticket_files (created_at);
