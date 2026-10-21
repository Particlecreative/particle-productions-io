-- 024_studio_settings.sql — Studio Control connections (BambooHR, TMDB keys), stored encrypted (AES-256-GCM).
CREATE TABLE IF NOT EXISTS studio_settings (
  brand_id    TEXT PRIMARY KEY,
  secrets     JSONB NOT NULL DEFAULT '{}'::jsonb,   -- { name: { sealed, set_at, set_by, meta } }
  config      JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
