-- Production Lock feature
-- Run: docker exec -i particleproductionsio-db-1 psql -U cpanel cpanel < db/migrations/production_lock.sql

ALTER TABLE productions ADD COLUMN IF NOT EXISTS locked BOOLEAN DEFAULT false;
ALTER TABLE productions ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;
ALTER TABLE productions ADD COLUMN IF NOT EXISTS locked_by TEXT;
