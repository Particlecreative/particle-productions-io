-- 028_library.sql — The Library: final files (TV masters, digital versions, sound stems) as Dropbox / Drive links.
-- Additive. Replaces the global Links page in the menu; the links table stays (call sheets use it) and shows as "Other links".
-- Files come from the CP (added by hand, or when a production is completed) or from a synced Google Sheet.
CREATE TABLE IF NOT EXISTS library_items (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  brand_id          TEXT NOT NULL REFERENCES brands(id),
  production_id     TEXT REFERENCES productions(id) ON DELETE SET NULL ON UPDATE CASCADE, -- NULL = Before 2026 (no CP production)
  production_locked BOOLEAN NOT NULL DEFAULT FALSE,   -- set by hand: the sheet sync never moves it
  category          TEXT NOT NULL CHECK (category IN ('tv_master', 'digital', 'sound', 'other')),
  title             TEXT NOT NULL,
  product           TEXT,                   -- e.g. Face Cream (the sheet tab)
  url               TEXT NOT NULL,          -- the link as shared (a file, or the folder the file is in)
  entry_key         TEXT,                   -- the file inside a shared Dropbox folder (base64url path); NULL = the link itself
  file_name         TEXT,
  ext               TEXT,
  file_kind         TEXT,                   -- video | audio | image | pdf | other
  size_bytes        BIGINT,
  file_modified     TIMESTAMPTZ,
  specs             JSONB NOT NULL DEFAULT '{}',  -- { aspect, duration, language, version }
  market            TEXT,                   -- US | CA | AUS | UK | ITALY …
  on_air            BOOLEAN,                -- the market's checkbox in the sheet
  code              TEXT,                   -- creative / promo code
  vanity            TEXT,                   -- e.g. particlemen.com
  landing_url       TEXT,
  notes             TEXT,
  sort              INTEGER NOT NULL DEFAULT 0,
  source            TEXT NOT NULL DEFAULT 'cp' CHECK (source IN ('cp', 'sheet')),
  source_key        TEXT UNIQUE,            -- sheet rows: stable key, so a sync updates instead of duplicating
  added_by          TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_library_items_production ON library_items (production_id, category, sort);
CREATE INDEX IF NOT EXISTS idx_library_items_brand ON library_items (brand_id);

-- Google Sheets the Library syncs from (every 15 minutes, and on demand)
CREATE TABLE IF NOT EXISTS library_sources (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  brand_id        TEXT NOT NULL REFERENCES brands(id),
  kind            TEXT NOT NULL DEFAULT 'google_sheet',
  sheet_id        TEXT NOT NULL,
  title           TEXT,
  last_synced_at  TIMESTAMPTZ,
  last_result     JSONB,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (brand_id, sheet_id)
);
