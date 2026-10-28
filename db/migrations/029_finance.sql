-- 029_finance.sql — CP × Finance: approved budgets, an append-only finance log, emails, accruals, the finance dashboard.
-- Additive and idempotent. Also makes official the columns prod already has but no migration created.

-- ── Columns prod already has (drift) ─────────────────────────────────────────
ALTER TABLE productions ADD COLUMN IF NOT EXISTS production_year INTEGER;
ALTER TABLE productions ADD COLUMN IF NOT EXISTS locked     BOOLEAN DEFAULT FALSE;
ALTER TABLE productions ADD COLUMN IF NOT EXISTS locked_at  TIMESTAMPTZ;
ALTER TABLE productions ADD COLUMN IF NOT EXISTS locked_by  TEXT;
ALTER TABLE production_line_items ADD COLUMN IF NOT EXISTS drive_url                 TEXT;
ALTER TABLE production_line_items ADD COLUMN IF NOT EXISTS dropbox_url               TEXT;
ALTER TABLE production_line_items ADD COLUMN IF NOT EXISTS payment_proof_url         TEXT;
ALTER TABLE production_line_items ADD COLUMN IF NOT EXISTS payment_proof_drive_url   TEXT;
ALTER TABLE production_line_items ADD COLUMN IF NOT EXISTS payment_proof_dropbox_url TEXT;
ALTER TABLE production_line_items ADD COLUMN IF NOT EXISTS photo_url                 TEXT;
ALTER TABLE production_line_items ADD COLUMN IF NOT EXISTS additional_files          JSONB;
ALTER TABLE production_line_items ADD COLUMN IF NOT EXISTS payment_note              TEXT;
ALTER TABLE production_line_items ADD COLUMN IF NOT EXISTS paid_by                   TEXT;
ALTER TABLE production_line_items ADD COLUMN IF NOT EXISTS payment_due               TIMESTAMPTZ;

-- ── Productions: approved budget (the frozen Planned Budget), sub-productions, finance ack ──
-- planned_budget_2026 stays the Planned Budget. Before approval it follows estimate + 10%;
-- once budget_approved_at is set it is frozen and only an approved increase moves it.
ALTER TABLE productions ADD COLUMN IF NOT EXISTS budget_approved_at   TIMESTAMPTZ;
ALTER TABLE productions ADD COLUMN IF NOT EXISTS budget_approved_by   TEXT;          -- who approved (e.g. Ayal Ebert)
ALTER TABLE productions ADD COLUMN IF NOT EXISTS budget_approved_user TEXT;          -- who clicked Approve in CP
ALTER TABLE productions ADD COLUMN IF NOT EXISTS approved_fx_rate     NUMERIC(10,4); -- ₪ per $ frozen at approval (buffer math)
ALTER TABLE productions ADD COLUMN IF NOT EXISTS approved_core        NUMERIC(12,2); -- estimate without the unexpected, USD, at approval
ALTER TABLE productions ADD COLUMN IF NOT EXISTS buffer_warned_at     TIMESTAMPTZ;   -- 80%-used warning sent
ALTER TABLE productions ADD COLUMN IF NOT EXISTS parent_id            TEXT;          -- re-edit / sub-production of (e.g. PRD26-37)
ALTER TABLE productions ADD COLUMN IF NOT EXISTS timeline_mode        TEXT;          -- legacy dashboard toggle (now: dates come from the lines)
ALTER TABLE productions ADD COLUMN IF NOT EXISTS finance_confirmed_at TIMESTAMPTZ;   -- finance ticked "Confirmed" on a closed production
ALTER TABLE productions ADD COLUMN IF NOT EXISTS finance_confirmed_by TEXT;
ALTER TABLE productions ADD COLUMN IF NOT EXISTS finance_sheet_legacy_url TEXT;      -- the old-format sheet, kept as a link after conversion
ALTER TABLE productions ADD COLUMN IF NOT EXISTS finance_sheet_seen_modified TIMESTAMPTZ; -- Drive modifiedTime after our last read/write
CREATE INDEX IF NOT EXISTS idx_productions_parent ON productions(parent_id);

-- ── Budget lines: order, cost month, what Claude read off the invoice ──
ALTER TABLE production_line_items ADD COLUMN IF NOT EXISTS sort_order    INTEGER;
ALTER TABLE production_line_items ADD COLUMN IF NOT EXISTS expense_month DATE;        -- override: the cost lands in this month (1st of month)
ALTER TABLE production_line_items ADD COLUMN IF NOT EXISTS invoice_data  JSONB;       -- { supplier, number, date, currency, net, vat, total, billed_to, … }
ALTER TABLE production_line_items ADD COLUMN IF NOT EXISTS invoice_flags JSONB;       -- [{ code, message }]
ALTER TABLE production_line_items ADD COLUMN IF NOT EXISTS invoice_read_at TIMESTAMPTZ;
ALTER TABLE production_line_items ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ DEFAULT NOW();
UPDATE production_line_items li SET sort_order = o.rn
  FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY production_id ORDER BY created_at, id) AS rn FROM production_line_items) o
 WHERE li.id = o.id AND li.sort_order IS NULL;

-- ── The finance log: every money / status / date change, append-only ──
-- No FK to productions on purpose: the record outlives a deleted production.
CREATE TABLE IF NOT EXISTS finance_events (
  id            BIGSERIAL PRIMARY KEY,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  brand_id      TEXT,
  production_id TEXT,
  line_item_id  UUID,
  kind          TEXT NOT NULL,          -- budget_approved, line_added, amount_changed, line_removed, budget_increase, paid, …
  label         TEXT,                   -- the line / production name at the time
  field         TEXT,
  old_value     TEXT,
  new_value     TEXT,
  currency      TEXT,
  delta         NUMERIC(14,2),          -- in the line's currency
  delta_usd     NUMERIC(14,2),
  expense_month DATE,
  reason        TEXT,                   -- scope_change | post_revision | rights_renewal | supplier_change | other
  approved_by   TEXT,
  approved_at   DATE,
  note          TEXT,
  link          TEXT,
  in_buffer     BOOLEAN,
  user_id       UUID,
  user_name     TEXT,
  source        TEXT NOT NULL DEFAULT 'cp',  -- cp | sheet | cc | system | finance
  batch_id      UUID,
  notify        TEXT,                   -- instant | bundle | NULL (log only)
  notified_at   TIMESTAMPTZ,
  meta          JSONB
);
CREATE INDEX IF NOT EXISTS idx_fin_events_prod ON finance_events(production_id, created_at);
CREATE INDEX IF NOT EXISTS idx_fin_events_pending ON finance_events(notify, created_at) WHERE notified_at IS NULL AND notify IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fin_events_created ON finance_events(created_at);

-- Append-only: rows can't be deleted, and only notified_at / production_id (a PRD rename) may change.
CREATE OR REPLACE FUNCTION finance_events_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'finance_events is append-only';
  END IF;
  IF (to_jsonb(OLD) - 'notified_at' - 'production_id') IS DISTINCT FROM (to_jsonb(NEW) - 'notified_at' - 'production_id') THEN
    RAISE EXCEPTION 'finance_events is append-only (only notified_at may change)';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_finance_events_guard ON finance_events;
CREATE TRIGGER trg_finance_events_guard BEFORE UPDATE OR DELETE ON finance_events
  FOR EACH ROW EXECUTE FUNCTION finance_events_guard();

-- ── Bank of Israel representative rates (₪ per $) ──
CREATE TABLE IF NOT EXISTS fx_rates (
  rate_date  DATE PRIMARY KEY,
  usd_ils    NUMERIC(10,4) NOT NULL,
  source     TEXT NOT NULL DEFAULT 'boi',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Email outbox: every finance email is queued, retried, and visible ──
CREATE TABLE IF NOT EXISTS email_outbox (
  id            BIGSERIAL PRIMARY KEY,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  kind          TEXT NOT NULL,
  production_id TEXT,
  dedupe_key    TEXT UNIQUE,            -- e.g. nudge:2026-10-28 — never queue the same email twice
  to_addr       TEXT NOT NULL,
  cc            TEXT[] NOT NULL DEFAULT '{}',
  subject       TEXT NOT NULL,
  html          TEXT NOT NULL,
  attachments   JSONB,                  -- [{ filename, mime, content_base64 }]
  shadow        BOOLEAN NOT NULL DEFAULT FALSE,
  original_to   TEXT,
  original_cc   TEXT[],
  status        TEXT NOT NULL DEFAULT 'queued',  -- queued | sent | failed
  attempts      INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error    TEXT,
  sent_at       TIMESTAMPTZ,
  meta          JSONB
);
CREATE INDEX IF NOT EXISTS idx_outbox_due ON email_outbox(status, next_attempt_at);

-- ── Two-way sheet sync: what CP last wrote to each sheet row ──
CREATE TABLE IF NOT EXISTS finance_sheet_rows (
  production_id TEXT NOT NULL,
  line_item_id  UUID NOT NULL,
  sheet_values  JSONB NOT NULL,         -- { name, job, budget, actual, invoice, status, method, bank, business }
  pushed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (production_id, line_item_id)
);

-- ── Monthly accrual report (built on the 25th, approved by Omer + Tomer, then sent to billing) ──
CREATE TABLE IF NOT EXISTS accrual_reports (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  month      DATE NOT NULL UNIQUE,      -- 1st of the month the accrual is for
  status     TEXT NOT NULL DEFAULT 'draft',  -- draft | approved | sent
  data       JSONB NOT NULL DEFAULT '{}',
  approvals  JSONB NOT NULL DEFAULT '[]',    -- [{ email, name, at }]
  built_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at    TIMESTAMPTZ,
  sent_by    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Finance dashboard access: one-time codes to allow-listed emails, then a 30-day device session ──
CREATE TABLE IF NOT EXISTS finance_access_codes (
  id         BIGSERIAL PRIMARY KEY,
  email      TEXT NOT NULL,
  code_hash  TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  used_at    TIMESTAMPTZ,
  ip         TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fin_codes_email ON finance_access_codes(email, created_at);
CREATE TABLE IF NOT EXISTS finance_sessions (
  token_hash   TEXT PRIMARY KEY,
  email        TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ,
  user_agent   TEXT
);

-- ── Yearly budget per company (was localStorage per browser) ──
CREATE TABLE IF NOT EXISTS finance_year_budgets (
  brand_id   TEXT NOT NULL,
  year       INTEGER NOT NULL,
  amount_usd NUMERIC(14,2) NOT NULL,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (brand_id, year)
);

-- ── Cast rights: term + renewal cost, so a renewal lands in the budget ──
ALTER TABLE casting ADD COLUMN IF NOT EXISTS term_months           INTEGER;
ALTER TABLE casting ADD COLUMN IF NOT EXISTS renewal_cost          NUMERIC(12,2);
ALTER TABLE casting ADD COLUMN IF NOT EXISTS renewal_currency      TEXT DEFAULT 'USD';
ALTER TABLE casting ADD COLUMN IF NOT EXISTS renewal_alert_sent_at TIMESTAMPTZ;
ALTER TABLE casting ADD COLUMN IF NOT EXISTS renewed_at            TIMESTAMPTZ;
