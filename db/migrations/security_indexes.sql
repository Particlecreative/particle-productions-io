-- Security & Performance Indexes
-- Run: docker exec -i particleproductionsio-db-1 psql -U cpanel cpanel < db/migrations/security_indexes.sql

-- Share token lookups (public endpoints)
CREATE INDEX IF NOT EXISTS idx_scripts_share_token ON scripts(share_token) WHERE share_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_weekly_share_token ON weekly_reports(share_token) WHERE share_token IS NOT NULL;

-- User brand access (queried on every auth check)
CREATE INDEX IF NOT EXISTS idx_user_brand_access_user_id ON user_brand_access(user_id);

-- Contract signatures lookup
CREATE INDEX IF NOT EXISTS idx_contract_signatures_contract_role ON contract_signatures(contract_id, signer_role);

-- Casting production_id (for production-level queries and potential FK)
CREATE INDEX IF NOT EXISTS idx_casting_production_id ON casting(production_id);
CREATE INDEX IF NOT EXISTS idx_casting_brand_id ON casting(brand_id);

-- Line items production reference
CREATE INDEX IF NOT EXISTS idx_line_items_production_id ON production_line_items(production_id);

-- Comments by script
CREATE INDEX IF NOT EXISTS idx_script_comments_scene ON script_comments(script_id, scene_id);

-- Change history lookups
CREATE INDEX IF NOT EXISTS idx_change_history_production ON change_history(production_id);
CREATE INDEX IF NOT EXISTS idx_change_history_user ON change_history(user_id);
CREATE INDEX IF NOT EXISTS idx_change_history_created ON change_history(created_at);
