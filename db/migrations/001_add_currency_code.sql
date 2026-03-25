-- Migration: Add currency_code column to production_line_items
-- Run on existing databases: docker compose exec db psql -U cpanel -d cpanel -f /dev/stdin < db/migrations/001_add_currency_code.sql
ALTER TABLE production_line_items
  ADD COLUMN IF NOT EXISTS currency_code TEXT DEFAULT 'USD';
