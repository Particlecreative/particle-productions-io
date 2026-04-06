-- Universal Blocks for Scripts Module
-- Run this on VPS: docker exec -i cp_db psql -U postgres cp_panel < script_blocks.sql

CREATE TABLE IF NOT EXISTS script_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id TEXT REFERENCES brands(id),
  name TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  scenes JSONB NOT NULL DEFAULT '[]',
  thumbnail_url TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_script_blocks_brand_id ON script_blocks(brand_id);
CREATE INDEX IF NOT EXISTS idx_script_blocks_category ON script_blocks(category);
