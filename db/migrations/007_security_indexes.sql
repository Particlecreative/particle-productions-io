-- Migration: Add indexes for performance + drop contract FK
CREATE INDEX IF NOT EXISTS idx_productions_brand_id ON productions(brand_id);
CREATE INDEX IF NOT EXISTS idx_productions_planned_start ON productions(planned_start);
CREATE INDEX IF NOT EXISTS idx_line_items_production_id ON production_line_items(production_id);
CREATE INDEX IF NOT EXISTS idx_line_items_type ON production_line_items(type);
CREATE INDEX IF NOT EXISTS idx_comments_production_id ON comments(production_id);
CREATE INDEX IF NOT EXISTS idx_gantt_events_production_id ON gantt_events(production_id);
CREATE INDEX IF NOT EXISTS idx_invoices_production_id ON invoices(production_id);
CREATE INDEX IF NOT EXISTS idx_change_history_production_id ON change_history(production_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_contract_signatures_contract_id ON contract_signatures(contract_id);
