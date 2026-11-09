-- 032_captain_caption.sql — Captain Caption 🧑‍✈️: text QC for Frame.io videos and Figma designs, triggered from Monday.
-- Additive only: new captain_* tables and three new settings columns. Nothing existing is changed.

ALTER TABLE settings ADD COLUMN IF NOT EXISTS captain_config JSONB;          -- scope, triggers, engines, posting switch (lib/captain/config.js)
ALTER TABLE settings ADD COLUMN IF NOT EXISTS captain_frameio_tokens JSONB;  -- the Captain's own Frame.io sign-in (separate from Creative Weekly's)
ALTER TABLE settings ADD COLUMN IF NOT EXISTS captain_worker JSONB;          -- worker heartbeat { at, pid, host, running }

-- Monday items the Captain follows, and the asset their review link points to
CREATE TABLE IF NOT EXISTS captain_tracked (
  id                 SERIAL PRIMARY KEY,
  board_id           TEXT NOT NULL,
  item_id            TEXT NOT NULL,
  discipline         TEXT NOT NULL,                -- video | design
  item_name          TEXT,
  link               TEXT,
  frameio_folder_id  TEXT,
  frameio_project_id TEXT,
  figma_file_key     TEXT,
  figma_node_id      TEXT,
  active             BOOLEAN NOT NULL DEFAULT true,
  meta               JSONB NOT NULL DEFAULT '{}',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (board_id, item_id)
);
CREATE INDEX IF NOT EXISTS captain_tracked_folder ON captain_tracked (frameio_folder_id) WHERE frameio_folder_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS captain_tracked_figma  ON captain_tracked (figma_file_key) WHERE figma_file_key IS NOT NULL;

-- One row per check of one deliverable: a video file (one round of one version/size) or one design frame set at a content hash
CREATE TABLE IF NOT EXISTS captain_checks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discipline   TEXT NOT NULL,                      -- video | design
  status       TEXT NOT NULL DEFAULT 'queued',     -- queued | running | passed | issues | error | skipped
  skip_reason  TEXT,
  trigger      TEXT,                               -- review | for_approval | new_version | manual
  board_id     TEXT,
  item_id      TEXT,
  item_name    TEXT,
  department   TEXT,
  product      TEXT,
  campaign     TEXT,
  person       TEXT,
  scope_reason TEXT,
  deliverable  TEXT,                               -- e.g. "Version 1 · 16x9"
  round        INT,
  asset        JSONB NOT NULL DEFAULT '{}',        -- video: {file_id, stack_id, folder_id, name, fps, duration} · design: {file_key, node_id, version_id, hash, frames}
  dedupe_key   TEXT,                               -- frameio:<file_id> · figma:<file_key>:<node_id>:<hash>
  engine       TEXT,
  model        TEXT,
  issue_count  INT NOT NULL DEFAULT 0,
  cost_usd     NUMERIC(10,5),
  duration_ms  INT,
  usage        JSONB,
  raw          JSONB,
  error        TEXT,
  posting      TEXT,                               -- off | test | live — what the posting switch allowed for this check
  posted_at    TIMESTAMPTZ,
  thumb        BYTEA,                              -- small JPEG still for the activity log (served by /api/captain/thumb/:id)
  requested_by TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at   TIMESTAMPTZ,
  finished_at  TIMESTAMPTZ,
  search       TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(item_name, '') || ' ' || coalesce(campaign, '') || ' ' || coalesce(product, '') || ' ' ||
                          coalesce(person, '') || ' ' || coalesce(deliverable, '') || ' ' || coalesce(department, ''))
  ) STORED
);
CREATE INDEX IF NOT EXISTS captain_checks_created ON captain_checks (created_at DESC);
CREATE INDEX IF NOT EXISTS captain_checks_dedupe  ON captain_checks (dedupe_key);
CREATE INDEX IF NOT EXISTS captain_checks_item    ON captain_checks (board_id, item_id);
CREATE INDEX IF NOT EXISTS captain_checks_search  ON captain_checks USING GIN (search);

CREATE TABLE IF NOT EXISTS captain_issues (
  id              SERIAL PRIMARY KEY,
  check_id        UUID NOT NULL REFERENCES captain_checks(id) ON DELETE CASCADE,
  idx             INT NOT NULL,
  start_s         NUMERIC,
  end_s           NUMERIC,
  frame           INT,                             -- Frame.io comment frame (1-based)
  duration_frames INT,
  node_id         TEXT,                            -- Figma text layer
  frame_node_id   TEXT,                            -- Figma frame the layer sits in
  found           TEXT,
  fix             TEXT,
  type            TEXT,
  severity        TEXT,                            -- must_fix | check
  note            TEXT,
  comment_id      TEXT,                            -- the Frame.io / Figma comment the Captain posted
  feedback        TEXT,                            -- good_catch | not_a_typo
  feedback_by     TEXT,
  feedback_at     TIMESTAMPTZ,
  search          TSVECTOR GENERATED ALWAYS AS (to_tsvector('simple', coalesce(found, '') || ' ' || coalesce(fix, '') || ' ' || coalesce(note, ''))) STORED
);
CREATE INDEX IF NOT EXISTS captain_issues_check  ON captain_issues (check_id);
CREATE INDEX IF NOT EXISTS captain_issues_search ON captain_issues USING GIN (search);

-- Everything that happens — webhooks, skips, checks, posts, errors, Brain edits, feedback, settings — the activity log
CREATE TABLE IF NOT EXISTS captain_events (
  id         BIGSERIAL PRIMARY KEY,
  kind       TEXT NOT NULL,                        -- webhook | skip | check | post | error | brain | feedback | settings | connect
  discipline TEXT,
  board_id   TEXT,
  item_id    TEXT,
  check_id   UUID,
  message    TEXT,
  data       JSONB NOT NULL DEFAULT '{}',
  actor      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS captain_events_created ON captain_events (created_at DESC);
CREATE INDEX IF NOT EXISTS captain_events_item    ON captain_events (board_id, item_id);

-- The Brain: what the Captain knows (added to his instructions at check time — the model itself is never retrained)
CREATE TABLE IF NOT EXISTS captain_brain (
  id         SERIAL PRIMARY KEY,
  type       TEXT NOT NULL,                        -- term | do_not_flag | rule | reference_image | document | learned | insight
  title      TEXT NOT NULL,
  content    TEXT,
  discipline TEXT NOT NULL DEFAULT 'both',         -- video | design | both
  scope      JSONB NOT NULL DEFAULT '{}',          -- { product, campaign, department } — empty = everything
  active     BOOLEAN NOT NULL DEFAULT true,
  status     TEXT NOT NULL DEFAULT 'approved',     -- approved | pending | rejected (anything learned automatically starts pending)
  source     TEXT NOT NULL DEFAULT 'manual',       -- manual | seed | feedback | import | live
  evidence   JSONB,
  added_by   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS captain_brain_type_title ON captain_brain (type, lower(title));

CREATE TABLE IF NOT EXISTS captain_brain_history (
  id         BIGSERIAL PRIMARY KEY,
  brain_id   INT,
  action     TEXT NOT NULL,                        -- create | update | delete | restore
  before     JSONB,
  after      JSONB,
  actor      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Background jobs: the captain-worker claims them with FOR UPDATE SKIP LOCKED (no Redis needed)
CREATE TABLE IF NOT EXISTS captain_jobs (
  id           BIGSERIAL PRIMARY KEY,
  kind         TEXT NOT NULL,
  payload      JSONB NOT NULL DEFAULT '{}',
  status       TEXT NOT NULL DEFAULT 'queued',     -- queued | running | done | failed
  run_after    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempts     INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  locked_at    TIMESTAMPTZ,
  locked_by    TEXT,
  last_error   TEXT,
  result       JSONB,
  dedupe_key   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS captain_jobs_ready ON captain_jobs (status, run_after);
CREATE UNIQUE INDEX IF NOT EXISTS captain_jobs_dedupe ON captain_jobs (dedupe_key) WHERE status IN ('queued', 'running') AND dedupe_key IS NOT NULL;

-- Seed the Brain (re-runnable)
INSERT INTO captain_brain (type, title, content, discipline, source, added_by) VALUES
  ('term', 'Particle', 'Brand name', 'both', 'seed', 'spec'),
  ('term', 'Face Cream', 'Product name', 'both', 'seed', 'spec'),
  ('term', 'Instant Eye Firming Cream', 'Product name', 'both', 'seed', 'spec'),
  ('term', 'Anti Gray Serum', 'Product name', 'both', 'seed', 'spec'),
  ('term', 'Gravité', 'Product name — always with the accent', 'both', 'seed', 'spec'),
  ('term', 'Deodorant', 'Product name', 'both', 'seed', 'spec'),
  ('rule', 'Particle is always capitalised', 'The brand name "Particle" is ALWAYS capitalised, even inside lowercase-style subtitles (e.g. "your particle experience" → "your Particle experience"). Severity must_fix.', 'both', 'seed', 'Tomer Wilf Lezmy'),
  ('rule', 'Currency symbol before the number', 'Prices and amounts use US formatting with the currency symbol before the number: "$10", never "10$". Severity must_fix.', 'both', 'seed', 'Tomer Wilf Lezmy')
ON CONFLICT DO NOTHING;
