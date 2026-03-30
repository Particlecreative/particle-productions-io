-- Scripts Generator Module
-- Run this on VPS: docker exec -i cp_db psql -U postgres cp_panel < scripts.sql

CREATE TABLE IF NOT EXISTS scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id TEXT REFERENCES brands(id),
  production_id TEXT REFERENCES productions(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT 'Untitled Script',
  scenes JSONB NOT NULL DEFAULT '[]',
  status TEXT DEFAULT 'draft',
  share_token TEXT UNIQUE,
  share_mode TEXT DEFAULT 'none',
  drive_url TEXT,
  source_url TEXT,
  created_by UUID REFERENCES users(id),
  created_by_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS script_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id UUID REFERENCES scripts(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  scenes JSONB NOT NULL,
  title TEXT,
  changed_by_name TEXT,
  change_summary TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS script_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id UUID REFERENCES scripts(id) ON DELETE CASCADE,
  scene_id TEXT,
  cell TEXT,
  selected_text TEXT,
  text TEXT NOT NULL,
  status TEXT DEFAULT 'open',
  author_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by_name TEXT
);

CREATE INDEX IF NOT EXISTS idx_scripts_brand_id ON scripts(brand_id);
CREATE INDEX IF NOT EXISTS idx_scripts_production_id ON scripts(production_id);
CREATE INDEX IF NOT EXISTS idx_script_versions_script_id ON script_versions(script_id);
CREATE INDEX IF NOT EXISTS idx_script_comments_script_id ON script_comments(script_id);
