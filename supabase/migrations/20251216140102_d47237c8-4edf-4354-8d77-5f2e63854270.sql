-- Create promo33_users table for the new subscription system
CREATE TABLE public.promo33_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  name TEXT,
  phone TEXT,
  instagram_username TEXT,
  instagram_data JSONB DEFAULT '{}'::jsonb,
  strategies_generated JSONB DEFAULT '[]'::jsonb,
  subscription_status TEXT NOT NULL DEFAULT 'pending',
  subscription_start TIMESTAMP WITH TIME ZONE,
  subscription_end TIMESTAMP WITH TIME ZONE,
  payment_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.promo33_users ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Service role full access promo33" 
ON public.promo33_users 
FOR ALL 
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_promo33_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_promo33_users_updated_at
BEFORE UPDATE ON public.promo33_users
FOR EACH ROW
EXECUTE FUNCTION public.update_promo33_users_updated_at();