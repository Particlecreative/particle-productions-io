-- =============================================
-- CP Panel — Supabase Schema
-- =============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- BRANDS
-- =============================================
CREATE TABLE brands (
  id TEXT PRIMARY KEY, -- 'particle' | 'blurr'
  name TEXT NOT NULL,
  tagline TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO brands VALUES ('particle', 'Particle', 'For Men', NOW());
INSERT INTO brands VALUES ('blurr', 'Blurr', '', NOW());

-- =============================================
-- SETTINGS (per brand)
-- =============================================
CREATE TABLE settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  brand_id TEXT REFERENCES brands(id),
  logo_url TEXT,
  colors JSONB DEFAULT '{}',
  fonts JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO settings (brand_id) VALUES ('particle');
INSERT INTO settings (brand_id) VALUES ('blurr');

-- =============================================
-- USERS (extends Supabase auth.users)
-- =============================================
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'Viewer', -- 'Viewer' | 'Editor' | 'Admin'
  brand_id TEXT REFERENCES brands(id),
  active BOOLEAN DEFAULT TRUE,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- PRODUCTIONS
-- =============================================
CREATE TABLE productions (
  id TEXT PRIMARY KEY, -- e.g. 'PRD26-01'
  brand_id TEXT REFERENCES brands(id) NOT NULL,
  project_name TEXT NOT NULL,
  product_type TEXT[] DEFAULT '{}',
  producer TEXT,
  planned_start DATE,
  planned_end DATE,
  planned_budget_2026 NUMERIC(12,2) DEFAULT 0,
  estimated_budget NUMERIC(12,2) DEFAULT 0,
  actual_spent NUMERIC(12,2) DEFAULT 0,
  payment_date DATE,
  stage TEXT DEFAULT 'Upcoming',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed: Particle 2026 Productions
INSERT INTO productions VALUES
('PRD26-01','particle','Particle BrandFormance AI Campaign',ARRAY['Brandformance'],'Omer Barak','2026-01-01','2026-01-31',1500,1500,1500,'2026-01-31','Completed',NOW(),NOW()),
('PRD26-02','particle','Particle 43 Shaving Gel AI Campaign',ARRAY['Shaving Gel'],'Omer Barak','2026-01-01','2026-01-31',1500,1500,1500,'2026-01-31','Completed',NOW(),NOW()),
('PRD26-03','particle','Particle Anti-Gray Serum AI Campaign',ARRAY['Anti-Gray Serum'],'Omer Barak','2026-02-01','2026-02-28',1500,1500,1200,'2026-02-28','Completed',NOW(),NOW()),
('PRD26-05','particle','Particle Hand Cream AI Campaign',ARRAY['Hand Cream'],'Omer Barak','2026-02-01','2026-02-28',1500,1500,1400,'2026-02-28','Completed',NOW(),NOW()),
('PRD26-06','particle','Particle Face Cream Couple Testimonials March',ARRAY['Face Cream'],'Omer Barak','2026-03-01','2026-03-31',10000,10000,4200,NULL,'In Progress',NOW(),NOW()),
('PRD26-07','particle','Particle AI NeoRoot Hair Renewal System',ARRAY['Neoroot'],'Omer Barak','2026-04-01','2026-04-30',1500,1500,0,NULL,'Upcoming',NOW(),NOW()),
('PRD26-08','particle','Particle Face Cream Performance with Michael',ARRAY['Face Cream'],'Omer Barak','2026-04-01','2026-04-30',25000,25000,8000,NULL,'In Progress',NOW(),NOW()),
('PRD26-09','particle','Particle Gravité Full Production Campaign',ARRAY['Gravité'],'Omer Barak','2026-05-01','2026-05-31',50000,50000,0,NULL,'Upcoming',NOW(),NOW()),
('PRD26-10','particle','Particle Gravité Backup Testimonials May',ARRAY['Gravité'],'Omer Barak','2026-05-01','2026-05-31',20000,20000,0,NULL,'Upcoming',NOW(),NOW()),
('PRD26-11','particle','Particle Face Cream July Campaign',ARRAY['Face Cream'],'Omer Barak','2026-07-01','2026-07-31',45000,45000,0,NULL,'Upcoming',NOW(),NOW()),
('PRD26-12','particle','Particle AI Saved Spot August Campaign',ARRAY[]::TEXT[],'Omer Barak','2026-08-01','2026-08-31',1500,1500,0,NULL,'Upcoming',NOW(),NOW()),
('PRD26-13','particle','Particle July Main Campaign — TBD',ARRAY[]::TEXT[],'Omer Barak','2026-07-01','2026-07-31',45000,45000,0,NULL,'Upcoming',NOW(),NOW()),
('PRD26-14','particle','Particle Gravité June Main Production',ARRAY['Gravité'],'Omer Barak','2026-06-01','2026-06-30',55000,55000,0,NULL,'Upcoming',NOW(),NOW()),
('PRD26-15','particle','Particle Gravité June Testimonials',ARRAY['Gravité'],'Omer Barak','2026-06-01','2026-06-30',33500,33500,0,NULL,'Upcoming',NOW(),NOW()),
('PRD26-16','particle','Particle Face Cream September Main',ARRAY['Face Cream'],'Omer Barak','2026-09-01','2026-09-30',45000,45000,0,NULL,'Upcoming',NOW(),NOW()),
('PRD26-17','particle','Particle AI Sports Invisible Sunscreen™',ARRAY['Sunscreen'],'Omer Barak','2026-03-01','2026-03-31',1500,1500,900,NULL,'In Progress',NOW(),NOW()),
('PRD26-18','particle','Particle Face Cream Testimonials October',ARRAY['Face Cream'],'Omer Barak','2026-10-01','2026-10-31',20000,20000,0,NULL,'Upcoming',NOW(),NOW()),
('PRD26-19','particle','Particle Campaign Saved Spot October',ARRAY[]::TEXT[],'Omer Barak','2026-10-01','2026-10-31',45000,45000,0,NULL,'Upcoming',NOW(),NOW()),
('PRD26-20','particle','Particle Saved Spot',ARRAY['Face Cream'],'Omer Barak','2026-08-01','2026-08-31',33000,33000,0,NULL,'Upcoming',NOW(),NOW()),
('PRD26-21','particle','Particle Flex Bank',ARRAY[]::TEXT[],'Omer Barak','2026-01-01','2026-12-31',118000,118000,22000,NULL,'In Progress',NOW(),NOW()),
('PRD26-22','particle','Particle FC SilverFox AI',ARRAY['Face Cream'],'Omer Barak','2026-02-01','2026-02-28',5000,5000,0,NULL,'Pre-Production',NOW(),NOW()),
('PRD26-23','particle','Gravite AI',ARRAY['Gravité'],'Omer Barak','2026-02-01','2026-02-28',5000,5000,5000,'2026-02-28','Completed',NOW(),NOW());

-- =============================================
-- PRODUCTION LINE ITEMS (Budget Table)
-- =============================================
CREATE TABLE production_line_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  production_id TEXT REFERENCES productions(id) ON DELETE CASCADE,
  item TEXT,
  full_name TEXT,
  planned_budget NUMERIC(12,2) DEFAULT 0,
  type TEXT DEFAULT 'Crew', -- Crew | Equipment | Catering & Transport | Post | Office
  status TEXT DEFAULT 'Not Started',
  timeline_start DATE,
  timeline_end DATE,
  actual_spent NUMERIC(12,2) DEFAULT 0,
  payment_status TEXT DEFAULT 'Not Paid',
  payment_method TEXT,
  bank_details TEXT,
  business_type TEXT,
  supplier_type TEXT DEFAULT 'New Supplier',
  invoice_status TEXT,
  invoice_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- CONTRACTS
-- =============================================
CREATE TABLE contracts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  production_id TEXT UNIQUE REFERENCES productions(id) ON DELETE CASCADE,
  provider_name TEXT,
  provider_email TEXT,
  status TEXT DEFAULT 'none', -- none | sent | signed
  sent_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  pdf_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- INVOICES
-- =============================================
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  line_item_id UUID REFERENCES production_line_items(id) ON DELETE CASCADE,
  production_id TEXT REFERENCES productions(id) ON DELETE CASCADE,
  file_url TEXT,
  amount NUMERIC(12,2),
  date_received TIMESTAMPTZ,
  payment_due TIMESTAMPTZ,
  status TEXT DEFAULT 'pending',
  mismatch BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- LINKS
-- =============================================
CREATE TABLE links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  production_id TEXT REFERENCES productions(id) ON DELETE CASCADE,
  category TEXT NOT NULL, -- Scripts | Shooting | Breakdown | Project Files | Final Deliverables
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- COMMENTS (Updates)
-- =============================================
CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  production_id TEXT REFERENCES productions(id) ON DELETE CASCADE,
  user_id UUID,
  author TEXT,
  body TEXT NOT NULL,
  mentions TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- NOTIFICATIONS
-- =============================================
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  production_id TEXT,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- CHANGE HISTORY
-- =============================================
CREATE TABLE change_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  production_id TEXT REFERENCES productions(id) ON DELETE CASCADE,
  field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  user_id UUID,
  user_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================
ALTER TABLE productions ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE links ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_history ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read/write their brand's data
CREATE POLICY "Authenticated read" ON productions FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Authenticated insert" ON productions FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY "Authenticated update" ON productions FOR UPDATE TO authenticated USING (TRUE);

CREATE POLICY "Authenticated read" ON production_line_items FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Authenticated insert" ON production_line_items FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY "Authenticated update" ON production_line_items FOR UPDATE TO authenticated USING (TRUE);
CREATE POLICY "Authenticated delete" ON production_line_items FOR DELETE TO authenticated USING (TRUE);

CREATE POLICY "Authenticated read" ON links FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Authenticated insert" ON links FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY "Authenticated update" ON links FOR UPDATE TO authenticated USING (TRUE);
CREATE POLICY "Authenticated delete" ON links FOR DELETE TO authenticated USING (TRUE);

CREATE POLICY "Authenticated read" ON comments FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Authenticated insert" ON comments FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY "Authenticated update" ON comments FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Authenticated delete" ON comments FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Own notifications" ON notifications FOR ALL TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Authenticated read" ON change_history FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Authenticated insert" ON change_history FOR INSERT TO authenticated WITH CHECK (TRUE);
