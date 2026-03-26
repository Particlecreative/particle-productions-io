-- =============================================
-- 004: Contract Signatures & E-Sign Support
-- =============================================

CREATE TABLE IF NOT EXISTS contract_signatures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contract_id UUID REFERENCES contracts(id) ON DELETE CASCADE,
  signer_role TEXT NOT NULL, -- 'provider' | 'hocp'
  signer_name TEXT,
  signer_email TEXT,
  signature_data TEXT, -- base64 PNG
  signed_at TIMESTAMPTZ,
  token TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE contracts ADD COLUMN IF NOT EXISTS events JSONB DEFAULT '[]';
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS drive_url TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS dropbox_url TEXT;
