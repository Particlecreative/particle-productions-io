-- 012: Add IP/device logging + legal compliance fields to contract_signatures
ALTER TABLE contract_signatures ADD COLUMN IF NOT EXISTS ip_address TEXT;
ALTER TABLE contract_signatures ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE contract_signatures ADD COLUMN IF NOT EXISTS agreed_at TIMESTAMPTZ;

-- Add require_hocp_signature flag to contracts
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS require_hocp_signature BOOLEAN DEFAULT true;
