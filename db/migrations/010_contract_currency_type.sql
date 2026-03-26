-- Add currency, contract_type, and effective_date to contracts table
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD';
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS contract_type TEXT DEFAULT 'crew';
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS effective_date DATE;

-- Add signer_id_number to contract_signatures for provider ID capture at signing time
ALTER TABLE contract_signatures ADD COLUMN IF NOT EXISTS signer_id_number TEXT;
