-- Create table to persist user session data in the cloud
CREATE TABLE public.user_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  squarecloud_username TEXT NOT NULL UNIQUE,
  email TEXT,
  days_remaining INTEGER DEFAULT 365,
  profile_sessions JSONB DEFAULT '[]'::jsonb,
  archived_profiles JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (for edge functions)
CREATE POLICY "Service role full access"
  ON public.user_sessions
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Allow anonymous read/write for now (users authenticate via SquareCloud, not Supabase Auth)
CREATE POLICY "Public read access"
  ON public.user_sessions
  FOR SELECT
  USING (true);

CREATE POLICY "Public insert access"
  ON public.user_sessions
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Public update access"
  ON public.user_sessions
  FOR UPDATE
  USING (true);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_user_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_user_sessions_updated_at
  BEFORE UPDATE ON public.user_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_user_sessions_updated_at();