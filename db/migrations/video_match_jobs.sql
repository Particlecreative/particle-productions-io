-- Video Match Jobs for frame extraction from video
-- Run: docker exec -i particleproductionsio-db-1 psql -U cpanel cpanel < db/migrations/video_match_jobs.sql

CREATE TABLE IF NOT EXISTS video_match_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id UUID REFERENCES scripts(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending',
  video_source TEXT,
  video_url TEXT,
  gemini_file_uri TEXT,
  match_results JSONB DEFAULT '[]',
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_video_match_jobs_script ON video_match_jobs(script_id);
