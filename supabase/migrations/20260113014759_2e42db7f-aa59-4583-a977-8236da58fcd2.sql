-- Add thumbnail columns for videos
ALTER TABLE public.free_trial_settings
ADD COLUMN IF NOT EXISTS welcome_video_thumbnail TEXT,
ADD COLUMN IF NOT EXISTS installation_video_thumbnail TEXT,
ADD COLUMN IF NOT EXISTS usage_video_thumbnail TEXT;