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
  production_id   TEXT REFERENCES productions(id) ON DELETE CASCADE,
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
  id          TEXT PRIMARY KEY,
  brand_id    TEXT NOT NULL DEFAULT '',
  week_start  TEXT NOT NULL,
  entries     JSONB NOT NULL DEFAULT '[]',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (brand_id, week_start)
);

-- =============================================
-- CONTRACTS
-- =============================================
CREATE TABLE IF NOT EXISTS contracts (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  production_id  TEXT UNIQUE REFERENCES productions(id) ON DELETE CASCADE,
  provider_name  TEXT,
  provider_email TEXT,
  status         TEXT DEFAULT 'none',   -- none | pending | sent | signed
  sent_at        TIMESTAMPTZ,
  signed_at      TIMESTAMPTZ,
  pdf_url        TEXT,
  events         JSONB DEFAULT '[]',
  drive_url      TEXT,
  dropbox_url    TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
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
  production_id TEXT REFERENCES productions(id) ON DELETE CASCADE,
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
  production_id   TEXT REFERENCES productions(id) ON DELETE CASCADE,
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
  production_id TEXT REFERENCES productions(id) ON DELETE CASCADE,
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
  production_id TEXT PRIMARY KEY REFERENCES productions(id) ON DELETE CASCADE,
  categories    JSONB DEFAULT '[]'
);

-- =============================================
-- COMMENTS (Updates)
-- =============================================
CREATE TABLE IF NOT EXISTS comments (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  production_id TEXT REFERENCES productions(id) ON DELETE CASCADE,
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
  production_id TEXT REFERENCES productions(id) ON DELETE CASCADE,
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
  production_id TEXT REFERENCES productions(id) ON DELETE CASCADE,
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
  production_id TEXT REFERENCES productions(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  role          TEXT,
  phone         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- FORM CONFIGS (supplier form branding per production)
-- =============================================
CREATE TABLE IF NOT EXISTS form_configs (
  production_id TEXT PRIMARY KEY REFERENCES productions(id) ON DELETE CASCADE,
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
