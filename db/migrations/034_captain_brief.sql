-- 034_captain_brief.sql — Captain Caption 🧑‍✈️ brief pre-flight: the third check type, "Brief", next to Video and Design.
-- Medium sends every brief here before it can be approved; text errors are caught before anything is made.
-- Additive only: new columns and two new tables. Nothing existing is changed.

ALTER TABLE captain_issues ADD COLUMN IF NOT EXISTS line_id TEXT;   -- brief checks: the brief line the issue is on
ALTER TABLE captain_issues ADD COLUMN IF NOT EXISTS rule TEXT;      -- the rule or check that was broken (shown to Medium and in HQ)
ALTER TABLE captain_issues ADD COLUMN IF NOT EXISTS data JSONB;     -- machine-applicable suggestion (e.g. how to split a super)
ALTER TABLE captain_brain  ADD COLUMN IF NOT EXISTS data JSONB;     -- structured fields: layout limits, offer calendar, list prices

CREATE INDEX IF NOT EXISTS captain_checks_brief ON captain_checks ((asset->>'brief_id')) WHERE discipline = 'brief';

-- Approved on-screen text: the lines of a brief that passed pre-flight, locked to the Monday item Medium created.
-- When that item's video or design arrives, the Captain also checks it against these lines (brief-match).
CREATE TABLE IF NOT EXISTS captain_approved_text (
  id          SERIAL PRIMARY KEY,
  board_id    TEXT,
  item_id     TEXT NOT NULL UNIQUE,
  brief_id    TEXT,
  check_id    UUID REFERENCES captain_checks(id) ON DELETE SET NULL,
  lane        TEXT,
  product     TEXT,
  campaign    TEXT,
  offer       JSONB,
  lines       JSONB NOT NULL DEFAULT '[]',
  override    JSONB,                                -- { by, reason } when approved despite open must-fix items
  approved_by TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Holiday Builder: up to 200 briefs checked together on the captain-worker; Medium polls for the result
CREATE TABLE IF NOT EXISTS captain_brief_batches (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status       TEXT NOT NULL DEFAULT 'queued',      -- queued | running | done | error
  campaign     TEXT,
  total        INT NOT NULL DEFAULT 0,
  done_count   INT NOT NULL DEFAULT 0,
  request      JSONB NOT NULL,
  results      JSONB NOT NULL DEFAULT '[]',         -- one verdict per brief
  summary      JSONB,                               -- lines checked, issues by type, cross-brief findings
  error        TEXT,
  requested_by TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS captain_brief_batches_created ON captain_brief_batches (created_at DESC);
