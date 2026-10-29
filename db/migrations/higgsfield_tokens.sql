-- Higgsfield sign-in for script images (lib/higgsfield.js also adds it on first use)
ALTER TABLE settings ADD COLUMN IF NOT EXISTS higgsfield_tokens JSONB;
