-- 035_medium.sql — MEDIUM 🔮, the creative strategist: reads what won (AfterLife, Upspring), learns the house brief style
-- from Lilian's tickets, and writes the next briefs for a human to approve. Additive only.

ALTER TABLE settings ADD COLUMN IF NOT EXISTS medium_config JSONB;   -- writing style, test-brand registry, lane mix, switches

-- The house-style corpus: every past brief Medium learns HOW TO WRITE from (one row per Monday ticket)
CREATE TABLE IF NOT EXISTS medium_exemplars (
  id             SERIAL PRIMARY KEY,
  board_id       TEXT NOT NULL,
  item_id        TEXT NOT NULL UNIQUE,
  format         TEXT NOT NULL,                     -- video | design
  name           TEXT,
  requester      TEXT,
  monday_created TIMESTAMPTZ,
  product        TEXT,
  campaign       TEXT,
  type           TEXT,                              -- video Type column (Script, UGC, AI Creator…)
  ratios         TEXT,
  kind           TEXT,                              -- original | reference_adaptation | template_swap | static_gif | creator_edit | new_hooks | translation
  lane           TEXT,                              -- Particle | SFY | GT | WAC
  template       TEXT,                              -- a named layout ("Receipt Vertical"), when the brief uses one
  persona        TEXT,
  tool_tokens    TEXT[],                            -- Claude / ChatGPT / Upspring / Arcads in the name
  brief          TEXT,
  script         TEXT,
  hook           TEXT,
  copy           TEXT,
  first_update   TEXT,
  excluded       BOOLEAN NOT NULL DEFAULT false,
  exclude_reason TEXT,                              -- Ashford / Levitas / Biomella / thin brief
  afterlife      JSONB,                             -- outcome once AfterLife is joined: shipped, never ran, percentile, winner
  winner         BOOLEAN,
  search         TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(product, '') || ' ' || coalesce(template, '') || ' ' || coalesce(brief, '') || ' ' ||
                          coalesce(script, '') || ' ' || coalesce(copy, '') || ' ' || coalesce(hook, ''))
  ) STORED,
  ingested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS medium_exemplars_pick   ON medium_exemplars (excluded, format, kind, lane, product);
CREATE INDEX IF NOT EXISTS medium_exemplars_search ON medium_exemplars USING GIN (search);

-- Named layouts the team already uses; Medium refers to them by name. AfterLife ranks them once assets are scored.
CREATE TABLE IF NOT EXISTS medium_templates (
  id             SERIAL PRIMARY KEY,
  name           TEXT NOT NULL UNIQUE,
  format         TEXT NOT NULL,                     -- static | video | gif
  description    TEXT,
  match          TEXT[] NOT NULL DEFAULT '{}',      -- words that identify it in a ticket
  usage_count    INT NOT NULL DEFAULT 0,
  last_used      TIMESTAMPTZ,
  afterlife_rank INT,
  active         BOOLEAN NOT NULL DEFAULT true
);

-- Outside ads whose structure Medium borrows (never the brand)
CREATE TABLE IF NOT EXISTS medium_donors (
  id          SERIAL PRIMARY KEY,
  brand       TEXT NOT NULL UNIQUE,
  takes       TEXT,                                 -- what we take from it (structure, pacing, look)
  upspring_ad TEXT,
  usage_count INT NOT NULL DEFAULT 0
);

-- What Medium believes, and how sure it is (only AfterLife test results change a status; a person may override)
CREATE TABLE IF NOT EXISTS medium_beliefs (
  id               SERIAL PRIMARY KEY,
  claim            TEXT NOT NULL,
  because          TEXT,
  source_refs      JSONB NOT NULL DEFAULT '[]',
  status           TEXT NOT NULL DEFAULT 'assumption', -- proven | testing | assumption | retired
  change_condition TEXT,
  test_ids         INT[] NOT NULL DEFAULT '{}',
  override         JSONB,
  last_reviewed    TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS medium_tests (
  id             SERIAL PRIMARY KEY,
  hypothesis     TEXT NOT NULL,
  axis           TEXT NOT NULL,                     -- hook | persona | format | product | lane | cta | background …
  lane           TEXT,
  cells          JSONB NOT NULL DEFAULT '[]',
  belief_id      INT,
  brief_ids      UUID[] NOT NULL DEFAULT '{}',
  decision_floor JSONB,                             -- { spend: 1000, days: 14 }
  status         TEXT NOT NULL DEFAULT 'idea',      -- idea | running | won | failed | inconclusive | parked
  result         JSONB,
  source         TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Destination articles for the magazine lanes (a lane brief must point at one that exists)
CREATE TABLE IF NOT EXISTS medium_articles (
  id            SERIAL PRIMARY KEY,
  lane          TEXT NOT NULL,
  url           TEXT NOT NULL UNIQUE,
  title         TEXT,
  type          TEXT,                               -- listicle | confession | explainer
  products      TEXT[] NOT NULL DEFAULT '{}',
  top_product   TEXT,
  claims        TEXT,
  last_seen     TIMESTAMPTZ,
  opportunity   BOOLEAN NOT NULL DEFAULT false      -- an article that doesn't exist yet but a brief needed
);

-- Product affinity: how likely a concept that won on one product works on another (seeded, then learned from tests)
CREATE TABLE IF NOT EXISTS medium_affinity (
  id          SERIAL PRIMARY KEY,
  cluster     TEXT NOT NULL,
  source      TEXT NOT NULL,
  target      TEXT NOT NULL,
  score       NUMERIC(3,2) NOT NULL,
  note        TEXT,
  tested      INT NOT NULL DEFAULT 0,
  won         INT NOT NULL DEFAULT 0,
  UNIQUE (source, target)
);

-- Every brief Medium writes: PENDING_REVIEW → APPROVED → SUBMITTED → SHIPPED → SCORED (or REJECTED / DROPPED / ERROR)
CREATE TABLE IF NOT EXISTS medium_briefs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status         TEXT NOT NULL DEFAULT 'QUEUED',
  source         TEXT NOT NULL DEFAULT 'generator',  -- generator | freeform | holiday | transfer
  author         TEXT,                               -- who asked (freeform: whose idea)
  lane           TEXT,
  product        TEXT,
  format         TEXT,                               -- video | design
  move           TEXT,                               -- ITERATE | REFRESH | TRANSFER_* | REVIVE | NEW_ANGLE | FREEFORM
  kind           TEXT,
  ticket_name    TEXT,
  fields         JSONB NOT NULL DEFAULT '{}',        -- why, hook, brief, script, copy, donts, test, vo_style, sizes, duration, type
  lines          JSONB NOT NULL DEFAULT '[]',        -- every on-screen / spoken line (for the Captain pre-flight)
  versions       JSONB,                              -- freeform: { medium: {...}, mine: {...} }
  exemplar_ids   INT[] NOT NULL DEFAULT '{}',
  evidence       JSONB NOT NULL DEFAULT '{}',        -- goes in the monday update, not the brief
  style          JSONB,                              -- { passed, failures, rewrites }
  score          JSONB,                              -- { total, subs, calibrated, critics, fixes }
  preflight      JSONB,                              -- Captain Caption: { check_id, verdict, must_fix, issues }
  request        JSONB NOT NULL DEFAULT '{}',
  edits          JSONB NOT NULL DEFAULT '[]',        -- reviewer edits as diffs (drift → writer instructions)
  reviewer       TEXT,
  review_reason  TEXT,
  reviewed_at    TIMESTAMPTZ,
  monday_item_id TEXT,
  error          TEXT,
  cost_usd       NUMERIC(10,5) NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS medium_briefs_status ON medium_briefs (status, created_at DESC);
