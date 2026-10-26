-- 027_production_tracker.sql — Production Tracker: what the tracker adds on top of a production (additive).
-- Stage, dates and budget stay on productions; this holds the tracking layer the CP didn't have.
CREATE TABLE IF NOT EXISTS production_tracker (
  production_id   TEXT PRIMARY KEY REFERENCES productions(id) ON DELETE CASCADE ON UPDATE CASCADE,
  deadline        DATE,                              -- the deadline we choose (not the planned end)
  deadline_label  TEXT,                              -- what's due, e.g. "Offline to Guy"
  notes           TEXT,
  links           JSONB NOT NULL DEFAULT '[]',       -- [{ id, title, url }]
  team            JSONB NOT NULL DEFAULT '[]',       -- [{ id, kind: internal|external, name, role, user_id?, monday_id? }]
  health          TEXT CHECK (health IN ('on_track', 'at_risk', 'blocked')),
  updated_by      TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_production_tracker_deadline ON production_tracker (deadline);
