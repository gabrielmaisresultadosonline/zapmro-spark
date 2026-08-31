-- Add column to track when lifetime user used their monthly creative
ALTER TABLE public.user_sessions 
ADD COLUMN IF NOT EXISTS lifetime_creative_used_at TIMESTAMP WITH TIME ZONE;