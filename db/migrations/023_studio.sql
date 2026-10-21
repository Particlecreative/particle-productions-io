-- 023_studio.sql — Studio Control: human decisions linking Monday TV tickets to CP productions.
-- Additive. Auto-matches are computed live; only "this is production X" / "not a production" is stored.
CREATE TABLE IF NOT EXISTS studio_ticket_links (
  item_id          TEXT PRIMARY KEY,               -- Monday item id
  board            TEXT,                           -- 'video' | 'design'
  production_id    TEXT,                           -- productions.id (NULL when decision = 'none')
  decision         TEXT NOT NULL CHECK (decision IN ('linked', 'none')),
  decided_by_name  TEXT,
  decided_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_studio_ticket_links_production ON studio_ticket_links (production_id);
