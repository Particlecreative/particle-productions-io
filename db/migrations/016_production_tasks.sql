-- 016_production_tasks.sql
-- Monday.com-style task board: tasks can be general or linked to a production,
-- assigned to a user, moved through statuses, with a per-task comment thread.

CREATE TABLE IF NOT EXISTS tasks (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  brand_id      TEXT NOT NULL,
  production_id TEXT REFERENCES productions(id) ON DELETE SET NULL ON UPDATE CASCADE,  -- NULL = General
  title         TEXT NOT NULL,
  description   TEXT DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'Not Started',   -- Not Started | Working on it | Stuck | Done
  priority      TEXT NOT NULL DEFAULT 'Medium',        -- Low | Medium | High | Urgent
  due_date      DATE,
  assignee_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  "order"       INTEGER DEFAULT 0,                     -- position within status column
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tasks_brand    ON tasks(brand_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_prod     ON tasks(production_id);

CREATE TABLE IF NOT EXISTS task_comments (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id    UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  author     TEXT,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id, created_at);
