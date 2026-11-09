-- 033_captain_import.sql — Captain Caption's Brain bootstrap: a READ-ONLY copy of past Frame.io + Figma comments
-- (2025 →), so the analysis steps never have to call Frame.io/Figma again. Additive only.

-- Live checks jump the queue; the history import runs at low priority
ALTER TABLE captain_jobs ADD COLUMN IF NOT EXISTS priority INT NOT NULL DEFAULT 0;
DROP INDEX IF EXISTS captain_jobs_ready;
CREATE INDEX IF NOT EXISTS captain_jobs_ready ON captain_jobs (status, priority DESC, run_after);

CREATE TABLE IF NOT EXISTS captain_import_runs (
  id          SERIAL PRIMARY KEY,
  status      TEXT NOT NULL DEFAULT 'running',     -- running | done | failed | cancelled
  since       DATE NOT NULL,
  sources     TEXT[] NOT NULL,
  plan        JSONB NOT NULL DEFAULT '{}',          -- what was queued: items per source, files, skipped + why
  started_by  TEXT,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

-- One row per Frame.io file version (one round of one deliverable), or per Figma task node
CREATE TABLE IF NOT EXISTS captain_import_assets (
  id              BIGSERIAL PRIMARY KEY,
  run_id          INT REFERENCES captain_import_runs(id) ON DELETE SET NULL,
  source          TEXT NOT NULL,                    -- frameio | figma
  asset_key       TEXT NOT NULL,                    -- frameio:<file_id> · figma:<file_key>:<node_id>:<item_id>
  board_id        TEXT,
  item_id         TEXT,
  item_name       TEXT,
  department      TEXT,
  product         TEXT,
  item_created_at TIMESTAMPTZ,
  -- Frame.io
  folder_id       TEXT,
  stack_id        TEXT,
  file_id         TEXT,
  file_name       TEXT,
  deliverable     TEXT,
  round           INT,
  rounds_total    INT,
  fps             NUMERIC,
  duration        NUMERIC,
  file_created_at TIMESTAMPTZ,
  comment_count   INT,
  -- Figma
  file_key        TEXT,
  node_id         TEXT,
  figma_file_name TEXT,
  folder_name     TEXT,
  meta            JSONB NOT NULL DEFAULT '{}',
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (asset_key)
);
CREATE INDEX IF NOT EXISTS captain_import_assets_item ON captain_import_assets (source, item_id);
CREATE INDEX IF NOT EXISTS captain_import_assets_stack ON captain_import_assets (stack_id, round);

-- Every human comment and reply (the Captain's own comments are never imported)
CREATE TABLE IF NOT EXISTS captain_import_comments (
  id                 BIGSERIAL PRIMARY KEY,
  run_id             INT REFERENCES captain_import_runs(id) ON DELETE SET NULL,
  source             TEXT NOT NULL,                 -- frameio | figma
  external_id        TEXT NOT NULL,
  parent_external_id TEXT,                          -- replies
  asset_id           BIGINT REFERENCES captain_import_assets(id) ON DELETE SET NULL,
  board_id           TEXT,
  item_id            TEXT,
  file_id            TEXT,                          -- Frame.io file version
  file_key           TEXT,                          -- Figma file
  node_id            TEXT,                          -- Figma layer it is pinned to
  node_type          TEXT,
  node_text          TEXT,                          -- the pinned layer's text today (if it is a text layer)
  author             TEXT,
  author_id          TEXT,
  text               TEXT,
  frame              INT,
  duration_frames    INT,
  has_annotation     BOOLEAN NOT NULL DEFAULT false,
  created_at         TIMESTAMPTZ,
  resolved_at        TIMESTAMPTZ,
  raw                JSONB NOT NULL DEFAULT '{}',
  -- filled by the analysis steps (after the crawl report is approved)
  category           TEXT,                          -- text | creative | noise
  analysis           JSONB,
  UNIQUE (source, external_id)
);
CREATE INDEX IF NOT EXISTS captain_import_comments_item ON captain_import_comments (source, item_id);
CREATE INDEX IF NOT EXISTS captain_import_comments_asset ON captain_import_comments (asset_id);
CREATE INDEX IF NOT EXISTS captain_import_comments_cat ON captain_import_comments (category);
