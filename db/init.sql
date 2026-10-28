-- =============================================
-- CP Panel — PostgreSQL Init Schema
-- Runs once when the db container first starts.
-- =============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================
-- BRANDS
-- =============================================
CREATE TABLE IF NOT EXISTS brands (
  id         TEXT PRIMARY KEY,       -- 'particle' | 'blurr'
  name       TEXT NOT NULL,
  tagline    TEXT DEFAULT '',
  primary_color   TEXT DEFAULT '#030b2e',
  secondary_color TEXT DEFAULT '#0808f8',
  accent_color    TEXT DEFAULT '#0808f8',
  bg_color        TEXT DEFAULT '#b7b7b7',
  logo_url   TEXT,
  colors     JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO brands (id, name, tagline, primary_color, secondary_color, accent_color, bg_color) VALUES
  ('particle', 'Particle', 'For Men',  '#030b2e', '#0808f8', '#0808f8', '#b7b7b7'),
  ('blurr',    'Blurr',    '',          '#B842A9', '#862F7B', '#B842A9', '#F5F5F5')
ON CONFLICT (id) DO NOTHING;

-- =============================================
-- SETTINGS (per brand)
-- =============================================
CREATE TABLE IF NOT EXISTS settings (
  brand_id   TEXT PRIMARY KEY REFERENCES brands(id) ON DELETE CASCADE,
  logo_url   TEXT,
  colors     JSONB DEFAULT '{}',
  fonts      JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO settings (brand_id) VALUES ('particle'), ('blurr')
ON CONFLICT (brand_id) DO NOTHING;

-- =============================================
-- USERS
-- =============================================
CREATE TABLE IF NOT EXISTS users (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email                TEXT NOT NULL UNIQUE,
  name                 TEXT,
  role                 TEXT NOT NULL DEFAULT 'Viewer',  -- Viewer | Editor | Accounting | Admin
  brand_id             TEXT REFERENCES brands(id),
  active               BOOLEAN DEFAULT TRUE,
  avatar_url           TEXT,
  must_change_password BOOLEAN DEFAULT FALSE,
  super_admin          BOOLEAN DEFAULT FALSE,
  password_hash        TEXT NOT NULL,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW(),
  deleted_at           TIMESTAMPTZ DEFAULT NULL
);

-- Demo users (password: demo1234 for all)
INSERT INTO users (id, email, name, role, brand_id, active, super_admin, password_hash) VALUES
  ('00000000-0000-0000-0000-000000000001', 'omer@particleformen.com',     'Omer Barak',        'Admin',  'particle', true,  true,  crypt('demo1234', gen_salt('bf', 10))),
  ('00000000-0000-0000-0000-000000000002', 'tomer@particleformen.com',    'Tomer Wilf Lezmy',  'Admin',  'particle', true,  false, crypt('demo1234', gen_salt('bf', 10))),
  ('00000000-0000-0000-0000-000000000003', 'producer@particleformen.com', 'Dana Levy',         'Editor', 'particle', true,  false, crypt('demo1234', gen_salt('bf', 10))),
  ('00000000-0000-0000-0000-000000000004', 'viewer@particleformen.com',   'Roy Mizrahi',       'Viewer', 'particle', true,  false, crypt('demo1234', gen_salt('bf', 10))),
  ('00000000-0000-0000-0000-000000000005', 'admin@demo.com',              'Admin User',        'Admin',  'particle', true,  true,  crypt('demo1234', gen_salt('bf', 10)))
ON CONFLICT (email) DO NOTHING;

-- =============================================
-- USER BRAND ACCESS
-- =============================================
CREATE TABLE IF NOT EXISTS user_brand_access (
  user_id   UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  brand_ids TEXT[] DEFAULT ARRAY['particle']
);

-- Default: everyone gets particle access; admins get both
INSERT INTO user_brand_access (user_id, brand_ids) VALUES
  ('00000000-0000-0000-0000-000000000001', ARRAY['particle', 'blurr']),
  ('00000000-0000-0000-0000-000000000002', ARRAY['particle', 'blurr']),
  ('00000000-0000-0000-0000-000000000003', ARRAY['particle']),
  ('00000000-0000-0000-0000-000000000004', ARRAY['particle']),
  ('00000000-0000-0000-0000-000000000005', ARRAY['particle', 'blurr'])
ON CONFLICT (user_id) DO NOTHING;

-- =============================================
-- PRODUCTIONS
-- =============================================
CREATE TABLE IF NOT EXISTS productions (
  id                  TEXT PRIMARY KEY,              -- e.g. 'PRD26-01'
  brand_id            TEXT NOT NULL REFERENCES brands(id),
  project_name        TEXT NOT NULL,
  product_type        TEXT[]    DEFAULT '{}',
  producer            TEXT,
  planned_start       DATE,
  planned_end         DATE,
  planned_budget_2026 NUMERIC(12,2) DEFAULT 0,
  estimated_budget    NUMERIC(12,2) DEFAULT 0,
  actual_spent        NUMERIC(12,2) DEFAULT 0,
  payment_date        DATE,
  stage               TEXT DEFAULT 'Pending',
  production_type     TEXT DEFAULT '',               -- '', 'AI', 'Shoot', etc.
  production_category TEXT,
  timeline_sync       BOOLEAN DEFAULT FALSE,
  shoot_dates         TEXT[]    DEFAULT '{}',
  delivery_date       DATE,
  air_date            DATE,
  custom_columns      JSONB DEFAULT '[]',            -- column definitions for this board
  custom_fields       JSONB DEFAULT '{}',            -- admin-defined custom field values
  finance_sheet_id        TEXT,                      -- linked Google Sheet id (finance mirror)
  finance_sheet_url       TEXT,
  finance_sheet_synced_at TIMESTAMPTZ,               -- last CP -> Sheet push
  finance_sheet_mode      TEXT,                      -- 'mirror' (CP-owned) | 'linked' (external, read-only)
  taxi_plan               JSONB,                     -- chat-based Taxi Wizard: { messages, plan }
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Seed Particle 2026 Productions
INSERT INTO productions (id, brand_id, project_name, product_type, producer, planned_start, planned_end, planned_budget_2026, estimated_budget, actual_spent, payment_date, stage, production_type) VALUES
  ('PRD26-01','particle','Particle BrandFormance AI Campaign',              ARRAY['Brandformance'],    'Omer Barak','2026-01-01','2026-01-31',1500,1500,1500,'2026-01-31','Completed','AI'),
  ('PRD26-02','particle','Particle 43 Shaving Gel AI Campaign',            ARRAY['Shaving Gel'],      'Omer Barak','2026-01-01','2026-01-31',1500,1500,1500,'2026-01-31','Completed','AI'),
  ('PRD26-03','particle','Particle Anti-Gray Serum AI Campaign',           ARRAY['Anti-Gray Serum'],  'Omer Barak','2026-02-01','2026-02-28',1500,1500,1200,'2026-02-28','Completed','AI'),
  ('PRD26-05','particle','Particle Hand Cream AI Campaign',                ARRAY['Hand Cream'],       'Omer Barak','2026-02-01','2026-02-28',1500,1500,1400,'2026-02-28','Completed','AI'),
  ('PRD26-06','particle','Particle Face Cream Couple Testimonials March',  ARRAY['Face Cream'],       'Omer Barak','2026-03-01','2026-03-31',10000,10000,4200,NULL,'Production','Shoot'),
  ('PRD26-07','particle','Particle AI NeoRoot Hair Renewal System',        ARRAY['Neoroot'],          'Omer Barak','2026-04-01','2026-04-30',1500,1500,0,NULL,'Pending','AI'),
  ('PRD26-08','particle','Particle Face Cream Performance with Michael',   ARRAY['Face Cream'],       'Omer Barak','2026-04-01','2026-04-30',25000,25000,8000,NULL,'Production','Shoot'),
  ('PRD26-09','particle','Particle Gravité Full Production Campaign',      ARRAY['Gravité'],          'Omer Barak','2026-05-01','2026-05-31',50000,50000,0,NULL,'Pending','Shoot'),
  ('PRD26-10','particle','Particle Gravité Backup Testimonials May',       ARRAY['Gravité'],          'Omer Barak','2026-05-01','2026-05-31',20000,20000,0,NULL,'Pending','Shoot'),
  ('PRD26-11','particle','Particle Face Cream July Campaign',              ARRAY['Face Cream'],       'Omer Barak','2026-07-01','2026-07-31',45000,45000,0,NULL,'Pending','Shoot'),
  ('PRD26-12','particle','Particle AI Saved Spot August Campaign',         ARRAY[]::TEXT[],           'Omer Barak','2026-08-01','2026-08-31',1500,1500,0,NULL,'Pending','AI'),
  ('PRD26-13','particle','Particle July Main Campaign — TBD',              ARRAY[]::TEXT[],           'Omer Barak','2026-07-01','2026-07-31',45000,45000,0,NULL,'Pending',''),
  ('PRD26-14','particle','Particle Gravité June Main Production',          ARRAY['Gravité'],          'Omer Barak','2026-06-01','2026-06-30',55000,55000,0,NULL,'Pending','Shoot'),
  ('PRD26-15','particle','Particle Gravité June Testimonials',             ARRAY['Gravité'],          'Omer Barak','2026-06-01','2026-06-30',33500,33500,0,NULL,'Pending','Shoot'),
  ('PRD26-16','particle','Particle Face Cream September Main',             ARRAY['Face Cream'],       'Omer Barak','2026-09-01','2026-09-30',45000,45000,0,NULL,'Pending','Shoot'),
  ('PRD26-17','particle','Particle AI Sports Invisible Sunscreen™',        ARRAY['Sunscreen'],        'Omer Barak','2026-03-01','2026-03-31',1500,1500,900,NULL,'Production','AI'),
  ('PRD26-18','particle','Particle Face Cream Testimonials October',       ARRAY['Face Cream'],       'Omer Barak','2026-10-01','2026-10-31',20000,20000,0,NULL,'Pending','Shoot'),
  ('PRD26-19','particle','Particle Campaign Saved Spot October',           ARRAY[]::TEXT[],           'Omer Barak','2026-10-01','2026-10-31',45000,45000,0,NULL,'Pending',''),
  ('PRD26-20','particle','Particle Saved Spot',                            ARRAY['Face Cream'],       'Omer Barak','2026-08-01','2026-08-31',33000,33000,0,NULL,'Pending',''),
  ('PRD26-21','particle','Particle Flex Bank',                             ARRAY[]::TEXT[],           'Omer Barak','2026-01-01','2026-12-31',118000,118000,22000,NULL,'Production',''),
  ('PRD26-22','particle','Particle FC SilverFox AI',                       ARRAY['Face Cream'],       'Omer Barak','2026-02-01','2026-02-28',5000,5000,0,NULL,'Pre Production','AI'),
  ('PRD26-23','particle','Gravite AI',                                      ARRAY['Gravité'],         'Omer Barak','2026-02-01','2026-02-28',5000,5000,5000,'2026-02-28','Completed','AI')
ON CONFLICT (id) DO NOTHING;

-- =============================================
-- PRODUCTION LINE ITEMS (Budget Table)
-- =============================================
CREATE TABLE IF NOT EXISTS production_line_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  production_id   TEXT REFERENCES productions(id) ON DELETE CASCADE ON UPDATE CASCADE,
  item            TEXT,                                 -- short label / role
  full_name       TEXT,                                 -- supplier / contractor full name
  type            TEXT DEFAULT 'Crew',                  -- Crew | Equipment | Catering & Transport | Post | Office
  status          TEXT DEFAULT 'Not Started',
  planned_budget  NUMERIC(12,2) DEFAULT 0,
  actual_spent    NUMERIC(12,2) DEFAULT 0,
  payment_status  TEXT DEFAULT 'Not Paid',
  payment_method  TEXT,
  bank_details    TEXT,
  business_type   TEXT,
  supplier_type   TEXT DEFAULT 'New Supplier',
  invoice_status  TEXT,
  invoice_url     TEXT,
  invoice_type    TEXT,                                 -- 'invoice' | 'receipt'
  timeline_start  DATE,
  timeline_end    DATE,
  receipt_required BOOLEAN DEFAULT FALSE,
  paid_at         DATE,
  notes           TEXT,
  supplier        TEXT,
  id_number       TEXT,
  currency_code   TEXT DEFAULT 'USD',                   -- USD | ILS — per-row currency for budget amounts
  custom_fields   JSONB DEFAULT '{}',                   -- admin-defined custom field values
  cc_purchase_id  TEXT NOT NULL DEFAULT '',              -- linked CC purchase if applicable
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- CC PURCHASES
-- =============================================
CREATE TABLE IF NOT EXISTS cc_purchases (
  id                   TEXT PRIMARY KEY,
  production_id        TEXT NOT NULL DEFAULT '',
  store_name           TEXT NOT NULL DEFAULT '',
  description          TEXT NOT NULL DEFAULT '',
  amount_without_vat   NUMERIC(12,2) DEFAULT 0,
  total_amount         NUMERIC(12,2) DEFAULT 0,
  purchase_date        TIMESTAMPTZ,
  purchaser_name       TEXT NOT NULL DEFAULT '',
  receipt_url          TEXT NOT NULL DEFAULT '',
  approval_status      TEXT NOT NULL DEFAULT 'Pending',
  approved_by          TEXT NOT NULL DEFAULT '',
  parent_line_item_id  TEXT NOT NULL DEFAULT '',
  notes                TEXT NOT NULL DEFAULT '',
  submitted_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- WEEKLY REPORTS
-- =============================================
CREATE TABLE IF NOT EXISTS weekly_reports (
  id              TEXT PRIMARY KEY,
  brand_id        TEXT NOT NULL DEFAULT '',
  week_start      TEXT NOT NULL,
  entries         JSONB NOT NULL DEFAULT '[]',
  general_updates JSONB NOT NULL DEFAULT '[]',
  title           TEXT NOT NULL DEFAULT '',
  creative_link   JSONB,
  weekly_files    JSONB NOT NULL DEFAULT '[]',
  share_token     TEXT,
  share_expires_at TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (brand_id, week_start)
);

-- =============================================
-- CONTRACTS
-- =============================================
CREATE TABLE IF NOT EXISTS contracts (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  production_id       TEXT UNIQUE REFERENCES productions(id) ON DELETE CASCADE ON UPDATE CASCADE,
  provider_name       TEXT,
  provider_email      TEXT,
  status              TEXT DEFAULT 'none',   -- none | pending | sent | signed
  sent_at             TIMESTAMPTZ,
  signed_at           TIMESTAMPTZ,
  pdf_url             TEXT,
  events              JSONB DEFAULT '[]',
  drive_url           TEXT,
  dropbox_url         TEXT,
  exhibit_a           TEXT,
  exhibit_b           TEXT,
  contract_intro      TEXT,
  contract_body       TEXT,
  fee_amount          NUMERIC(12,2),
  payment_terms       TEXT,
  contract_pdf_base64 TEXT,
  provider_id_number  TEXT,
  provider_address    TEXT,
  currency            TEXT DEFAULT 'USD',
  contract_type       TEXT DEFAULT 'crew',  -- 'crew' | 'cast'
  effective_date      DATE,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Contract e-signatures
CREATE TABLE IF NOT EXISTS contract_signatures (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contract_id    UUID REFERENCES contracts(id) ON DELETE CASCADE,
  signer_role    TEXT NOT NULL,            -- 'provider' | 'hocp'
  signer_name    TEXT,
  signer_email   TEXT,
  signature_data TEXT,                     -- base64 PNG
  signed_at      TIMESTAMPTZ,
  token          TEXT UNIQUE NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- INVOICES
-- =============================================
CREATE TABLE IF NOT EXISTS invoices (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  line_item_id  UUID REFERENCES production_line_items(id) ON DELETE CASCADE,
  production_id TEXT REFERENCES productions(id) ON DELETE CASCADE ON UPDATE CASCADE,
  file_url      TEXT,
  amount        NUMERIC(12,2),
  date_received TIMESTAMPTZ,
  payment_due   TIMESTAMPTZ,
  status        TEXT DEFAULT 'pending',
  mismatch      BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- RECEIPTS (חשבוניות מס)
-- =============================================
CREATE TABLE IF NOT EXISTS receipts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  line_item_id    UUID REFERENCES production_line_items(id) ON DELETE SET NULL,
  production_id   TEXT REFERENCES productions(id) ON DELETE CASCADE ON UPDATE CASCADE,
  paid_at         DATE,
  receipt_url     TEXT,
  reminder_sent   BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- LINKS
-- =============================================
CREATE TABLE IF NOT EXISTS links (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  production_id TEXT REFERENCES productions(id) ON DELETE CASCADE ON UPDATE CASCADE,
  category      TEXT NOT NULL,
  title         TEXT NOT NULL,
  url           TEXT NOT NULL,
  "order"       INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- LINK CATEGORIES (per production, JSONB array)
-- =============================================
CREATE TABLE IF NOT EXISTS link_categories (
  production_id TEXT PRIMARY KEY REFERENCES productions(id) ON DELETE CASCADE ON UPDATE CASCADE,
  categories    JSONB DEFAULT '[]'
);

-- =============================================
-- COMMENTS (Updates)
-- =============================================
CREATE TABLE IF NOT EXISTS comments (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  production_id TEXT REFERENCES productions(id) ON DELETE CASCADE ON UPDATE CASCADE,
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  author        TEXT,
  body          TEXT NOT NULL,
  mentions      TEXT[] DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- NOTIFICATIONS
-- =============================================
CREATE TABLE IF NOT EXISTS notifications (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,
  message       TEXT NOT NULL,
  production_id TEXT,
  read          BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- CHANGE HISTORY
-- =============================================
CREATE TABLE IF NOT EXISTS change_history (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  production_id TEXT REFERENCES productions(id) ON DELETE CASCADE ON UPDATE CASCADE,
  field         TEXT NOT NULL,
  old_value     TEXT,
  new_value     TEXT,
  user_id       UUID,
  user_name     TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- GANTT PHASES (global templates)
-- =============================================
CREATE TABLE IF NOT EXISTS gantt_phases (
  id            TEXT PRIMARY KEY,               -- e.g. 'pre_production'
  production_id TEXT,                           -- NULL = global template
  name          TEXT NOT NULL,
  color         TEXT DEFAULT '#7c3aed',
  order_idx     INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO gantt_phases (id, name, color, order_idx) VALUES
  ('concepts',        'Concepts',        '#7c3aed', 0),
  ('scripting',       'Scripting',       '#2563eb', 1),
  ('pre_production',  'Pre Production',  '#0891b2', 2),
  ('production',      'Production',      '#16a34a', 3),
  ('post_production', 'Post Production', '#d97706', 4)
ON CONFLICT (id) DO NOTHING;

-- =============================================
-- GANTT EVENTS
-- =============================================
CREATE TABLE IF NOT EXISTS gantt_events (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  production_id TEXT REFERENCES productions(id) ON DELETE CASCADE ON UPDATE CASCADE,
  phase_id      TEXT REFERENCES gantt_phases(id) ON DELETE SET NULL,
  title         TEXT NOT NULL,
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  color         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- SUPPLIERS
-- =============================================
CREATE TABLE IF NOT EXISTS suppliers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name       TEXT NOT NULL,
  role            TEXT,
  phone           TEXT,
  email           TEXT,
  id_number       TEXT,
  bank_name       TEXT,
  account_number  TEXT,
  branch          TEXT,
  swift           TEXT,
  business_type   TEXT,
  company_name    TEXT,
  tax_id          TEXT,
  food_restrictions TEXT,
  dietary_notes   TEXT,
  supplier_type   TEXT DEFAULT 'New Supplier',
  notes           TEXT,
  productions     TEXT[] DEFAULT '{}',
  source          TEXT DEFAULT 'manual',       -- 'manual' | 'form'
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- SUPPLIER FORM SUBMISSIONS
-- =============================================
CREATE TABLE IF NOT EXISTS supplier_submissions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  production_id TEXT,
  submitted_at  TIMESTAMPTZ DEFAULT NOW(),
  data          JSONB DEFAULT '{}'
);

-- =============================================
-- PEOPLE ON SET
-- =============================================
CREATE TABLE IF NOT EXISTS people_on_set (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  production_id TEXT REFERENCES productions(id) ON DELETE CASCADE ON UPDATE CASCADE,
  name          TEXT NOT NULL,
  role          TEXT,
  phone         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- FORM CONFIGS (supplier form branding per production)
-- =============================================
CREATE TABLE IF NOT EXISTS form_configs (
  production_id TEXT PRIMARY KEY REFERENCES productions(id) ON DELETE CASCADE ON UPDATE CASCADE,
  config        JSONB DEFAULT '{"logoUrl":"","bgColor":"","bgImageUrl":""}'
);

-- =============================================
-- IMPROVEMENT TICKETS
-- =============================================
CREATE TABLE IF NOT EXISTS improvement_tickets (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title       TEXT NOT NULL,
  body        TEXT DEFAULT '',
  status      TEXT DEFAULT 'open',             -- open | in_progress | done | closed
  priority    TEXT DEFAULT 'medium',           -- low | medium | high | critical
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- TASKS (Monday.com-style board)
-- General or production-linked, assignable, with comment threads
-- =============================================
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

-- =============================================
-- USER GROUPS
-- =============================================
CREATE TABLE IF NOT EXISTS user_groups (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  description TEXT DEFAULT '',
  role        TEXT DEFAULT 'Viewer',           -- Viewer | Accounting | Editor | Admin
  members     UUID[] DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- ADMIN-EDITABLE DROPDOWN LISTS
-- Mirrors src/lib/listService.js LIST_DEFAULTS
-- =============================================
CREATE TABLE IF NOT EXISTS lists (
  key   TEXT PRIMARY KEY,
  items JSONB DEFAULT '[]'
);

INSERT INTO lists (key, items) VALUES
  ('stages',           '["Pre Production","Production","Post","Paused","Pending","Completed"]'),
  ('lineItemTypes',    '["Crew","Equipment","Catering & Transport","Post","Office"]'),
  ('lineItemStatuses', '["Working on it","Done","Stuck","Not Started"]'),
  ('crewRoles',        '["Director","Technical Photographer","Photographer","DOP","Director of Photography","Offline Editor","Online Editor","Sound Designer","Stylist","Makeup","Talent","Actor","Actress","Gaffer","Grip","Art Director"]'),
  ('productTypes',     '["Face Cream","Sunscreen","Gravité","Neoroot","Hand Cream","Anti-Gray Serum","Shaving Gel","Brandformance","Eye Cream","Body Wash","Other"]'),
  ('productionTypes',  '["Remote Shoot","Shoot","AI"]'),
  ('paymentMethods',   '["Bank Transfer","Credit Card","PayPal","Remote","Office Card"]'),
  ('businessTypes',    '["עוסק פטור","עוסק מורשה","חברה בע\u05de","שכר אומנים","Company LTD","Self Employed"]')
ON CONFLICT (key) DO NOTHING;

-- =============================================
-- BUDGET CUSTOM COLUMNS (global template)
-- =============================================
CREATE TABLE IF NOT EXISTS budget_custom_cols (
  key   TEXT PRIMARY KEY DEFAULT 'global',
  cols  JSONB DEFAULT '[]'
);

INSERT INTO budget_custom_cols (key, cols) VALUES ('global', '[]')
ON CONFLICT (key) DO NOTHING;

-- =============================================
-- APP CONFIG (version, etc.)
-- =============================================
CREATE TABLE IF NOT EXISTS app_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO app_config (key, value) VALUES
  ('version', '1.8')
ON CONFLICT (key) DO NOTHING;

-- =============================================
-- CALL SHEETS
-- =============================================
CREATE TABLE IF NOT EXISTS call_sheets (
  id                   TEXT PRIMARY KEY,
  production_id        TEXT NOT NULL DEFAULT '',
  title                TEXT NOT NULL DEFAULT '',
  shoot_date           TEXT,
  created_by           TEXT NOT NULL DEFAULT '',
  recipients           TEXT NOT NULL DEFAULT 'all',
  custom_recipient_ids JSONB NOT NULL DEFAULT '[]',
  sections             JSONB NOT NULL DEFAULT '{}',
  overview             JSONB NOT NULL DEFAULT '{}',
  location             JSONB NOT NULL DEFAULT '{}',
  project_details      JSONB NOT NULL DEFAULT '{}',
  technical            JSONB NOT NULL DEFAULT '{}',
  primary_contacts     JSONB NOT NULL DEFAULT '[]',
  crew_contacts        JSONB NOT NULL DEFAULT '[]',
  selected_link_ids    JSONB NOT NULL DEFAULT '[]',
  extra_fields         JSONB NOT NULL DEFAULT '[]',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- CASTING & RIGHTS
-- =============================================
CREATE TABLE IF NOT EXISTS casting (
  id                    TEXT PRIMARY KEY,
  production_id         TEXT NOT NULL DEFAULT '',
  project_name          TEXT NOT NULL DEFAULT '',
  brand_id              TEXT NOT NULL DEFAULT '',
  name                  TEXT NOT NULL DEFAULT '',
  photo_url             TEXT NOT NULL DEFAULT '',
  role                  TEXT NOT NULL DEFAULT 'Model',
  period                TEXT NOT NULL DEFAULT 'Perpetually',
  start_date            DATE,
  end_date              DATE,
  warning_date          DATE,
  contract_status       TEXT NOT NULL DEFAULT 'Running',
  usage                 TEXT[] NOT NULL DEFAULT '{}',
  signed_contract_url   TEXT NOT NULL DEFAULT '',
  contract_manager_name TEXT NOT NULL DEFAULT '',
  notes                 TEXT NOT NULL DEFAULT '',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- VIEW ORDERS (column/production ordering per user)
-- =============================================
CREATE TABLE IF NOT EXISTS view_orders (
  view_key   TEXT NOT NULL,
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  "order"    JSONB DEFAULT '[]',
  for_all    BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (view_key, user_id)
);

-- =============================================
-- CREATIVE WEEKLY (see db/migrations/020_creative_reports.sql)
-- =============================================
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
  by_division        JSONB,
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

-- =============================================
-- CP × FINANCE (mirror of db/migrations/029_finance.sql)
-- =============================================

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
