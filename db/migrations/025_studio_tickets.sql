-- 025_studio_tickets.sql — tickets created from the Studio's AI ticket creator (history only; Monday is the record).
CREATE TABLE IF NOT EXISTS studio_tickets (
  id               BIGSERIAL PRIMARY KEY,
  board            TEXT NOT NULL,
  item_id          TEXT NOT NULL,
  item_url         TEXT,
  name             TEXT,
  fields           JSONB,
  conversation     JSONB,
  created_by_name  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_studio_tickets_created ON studio_tickets (created_at DESC);
