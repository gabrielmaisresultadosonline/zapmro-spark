-- Create table to log all corrections made by users
CREATE TABLE public.corretor_corrections_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES corretor_users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  text_length INTEGER DEFAULT 0,
  correction_type TEXT DEFAULT 'text'
);

-- Add corrections_count column to corretor_users for quick access
ALTER TABLE public.corretor_users 
ADD COLUMN corrections_count INTEGER DEFAULT 0;

-- Enable RLS
ALTER TABLE public.corretor_corrections_log ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Allow public insert on corretor_corrections_log" 
ON public.corretor_corrections_log 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow public read on corretor_corrections_log" 
ON public.corretor_corrections_log 
FOR SELECT 
USING (true);

-- Index for faster queries
CREATE INDEX idx_corretor_corrections_user_id ON public.corretor_corrections_log(user_id);
CREATE INDEX idx_corretor_corrections_created_at ON public.corretor_corrections_log(created_at);