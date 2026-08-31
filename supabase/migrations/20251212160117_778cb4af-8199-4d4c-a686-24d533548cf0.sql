-- Add last_access column to user_sessions table
ALTER TABLE public.user_sessions 
ADD COLUMN IF NOT EXISTS last_access TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Create index for faster queries on last_access
CREATE INDEX IF NOT EXISTS idx_user_sessions_last_access ON public.user_sessions(last_access DESC);