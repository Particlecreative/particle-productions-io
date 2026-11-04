-- 030_studio_hot_projects.sql — Studio → Hot Projects: the big Monday projects the team pinned.
-- Monday stays the record for the projects; this only holds what's pinned, its order, and CP-only notes.
CREATE TABLE IF NOT EXISTS studio_hot_projects (
  id          BIGSERIAL PRIMARY KEY,
  brand_id    TEXT NOT NULL DEFAULT 'particle',
  board       TEXT NOT NULL,                    -- 'video' | 'design'
  item_id     TEXT NOT NULL,                    -- the project's main Monday item
  title       TEXT,                             -- display name (Monday's title when empty)
  note        TEXT,                             -- note for the team, CP only
  related     JSONB NOT NULL DEFAULT '[]',      -- other tickets of the project: [{ board, item_id }]
  position    INT NOT NULL DEFAULT 0,
  added_by    TEXT,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (brand_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_studio_hot_projects_brand ON studio_hot_projects (brand_id, position);
