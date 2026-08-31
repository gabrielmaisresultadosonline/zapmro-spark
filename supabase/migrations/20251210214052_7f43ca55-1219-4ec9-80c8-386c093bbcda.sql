-- Remove overly permissive public RLS policies from user_sessions
DROP POLICY IF EXISTS "Public read access" ON public.user_sessions;
DROP POLICY IF EXISTS "Public insert access" ON public.user_sessions;
DROP POLICY IF EXISTS "Public update access" ON public.user_sessions;

-- Keep only service role access - all user access goes through edge functions
-- The existing "Service role full access" policy remains for edge functions