-- 015_contract_body_intro.sql
-- Store the editable preamble (intro) and main body of a contract so that
-- edits made in the Contract Preview round-trip into the signed document.
-- Without these columns, edits in the preview have nowhere to live and the
-- signing UI / final PDF always falls back to the hardcoded template.

ALTER TABLE contracts ADD COLUMN IF NOT EXISTS contract_intro TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS contract_body  TEXT;
