-- 008: Add exhibit fields to contracts for e-signature pipeline
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS exhibit_a TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS exhibit_b TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS fee_amount NUMERIC(12,2);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS payment_terms TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS contract_pdf_base64 TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS provider_id_number TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS provider_address TEXT;
