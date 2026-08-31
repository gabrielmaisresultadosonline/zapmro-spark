-- Create table for ZAPMRO users (separate from MRO Instagram users)
CREATE TABLE public.zapmro_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  username TEXT NOT NULL,
  email TEXT,
  email_locked BOOLEAN DEFAULT false,
  days_remaining INTEGER DEFAULT 365,
  last_access TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT zapmro_users_username_unique UNIQUE (username)
);

-- Enable Row Level Security
ALTER TABLE public.zapmro_users ENABLE ROW LEVEL SECURITY;

-- Create policy for service role access
CREATE POLICY "Service role full access on zapmro_users" 
ON public.zapmro_users 
FOR ALL 
TO authenticated, anon
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_zapmro_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_zapmro_users_updated_at
BEFORE UPDATE ON public.zapmro_users
FOR EACH ROW
EXECUTE FUNCTION public.update_zapmro_users_updated_at();