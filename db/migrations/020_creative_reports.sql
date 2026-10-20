-- 020_creative_reports.sql — Creative Weekly (studio deck for the CEOs). Additive only.
-- Run: docker compose -f docker-compose.prod.yml exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < db/migrations/020_creative_reports.sql

ALTER TABLE settings ADD COLUMN IF NOT EXISTS creative_config JSONB;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS frameio_tokens  JSONB;
-- Repo drift: used by existing code but never created by a migration (no-op where they already exist)
ALTER TABLE settings ADD COLUMN IF NOT EXISTS dropbox_tokens  JSONB;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS monday_config   JSONB;

CREATE TABLE IF NOT EXISTS creative_reports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id          TEXT NOT NULL REFERENCES brands(id),
  week_start        TEXT NOT NULL CHECK (week_start ~ '^\d{4}-\d{2}-\d{2}$'),   -- Sunday (Israel), same format as weekly_reports
  title             TEXT NOT NULL DEFAULT '',
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','final')),
  snapshot          JSONB NOT NULL DEFAULT '{}'::jsonb,   -- machine data; replaced on refresh
  snapshot_hash     TEXT,
  overrides         JSONB NOT NULL DEFAULT '{}'::jsonb,   -- human edits keyed by Monday item id / slide key
  template          JSONB NOT NULL DEFAULT '{}'::jsonb,   -- frozen copy of the default template at generate time
  narrative         JSONB,
  revision          INTEGER NOT NULL DEFAULT 1,           -- optimistic lock
  generated_at      TIMESTAMPTZ,
  generated_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  generated_by_name TEXT,
  generation_ms     INTEGER,
  finalized_at      TIMESTAMPTZ,
  finalized_by_name TEXT,
  share_token       TEXT UNIQUE,
  share_expires_at  TIMESTAMPTZ,
  share_created_at  TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (brand_id, week_start)
);

CREATE TABLE IF NOT EXISTS creative_report_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id       UUID NOT NULL REFERENCES creative_reports(id) ON DELETE CASCADE,
  version_number  INTEGER NOT NULL,
  reason          TEXT NOT NULL DEFAULT 'manual' CHECK (reason IN ('manual','pre_refresh','pre_restore','finalize','auto')),
  label           TEXT,
  report_revision INTEGER,
  snapshot        JSONB NOT NULL,
  overrides       JSONB NOT NULL,
  template        JSONB NOT NULL,
  narrative       JSONB,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by_name TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (report_id, version_number)
);
CREATE INDEX IF NOT EXISTS idx_creative_report_versions_report ON creative_report_versions(report_id, version_number DESC);

-- 8-week trend cache (one row per brand/week/board)
CREATE TABLE IF NOT EXISTS creative_week_stats (
  brand_id           TEXT NOT NULL,
  week_start         TEXT NOT NULL,
  board_key          TEXT NOT NULL,                       -- 'video' | 'design'
  delivered_count    INTEGER NOT NULL DEFAULT 0,
  delivered_item_ids TEXT[] NOT NULL DEFAULT '{}',
  by_person          JSONB NOT NULL DEFAULT '{}'::jsonb,
  by_product         JSONB NOT NULL DEFAULT '{}'::jsonb,
  rule_hash          TEXT,                                -- delivery-rule hash; mismatch => recompute
  is_closed          BOOLEAN NOT NULL DEFAULT FALSE,
  computed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (brand_id, week_start, board_key)
);

-- Resolved media folder listings (never expiring URLs)
CREATE TABLE IF NOT EXISTS creative_media_index (
  ref_key     TEXT PRIMARY KEY,
  kind        TEXT NOT NULL,
  source_url  TEXT,
  listing     JSONB,
  error       TEXT,
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Thumbnail / poster bytes (the api container has no volume, so the DB is the durable cache)
CREATE TABLE IF NOT EXISTS creative_media_cache (
  cache_key      TEXT PRIMARY KEY,                        -- sha256(provider|file id|version|variant)
  provider       TEXT NOT NULL,
  content_type   TEXT NOT NULL,
  bytes          BYTEA NOT NULL,
  size_bytes     INTEGER NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_access_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE creative_media_cache ALTER COLUMN bytes SET STORAGE EXTERNAL;  -- JPEGs: skip pglz compression
CREATE INDEX IF NOT EXISTS idx_creative_media_cache_access ON creative_media_cache(last_access_at);
