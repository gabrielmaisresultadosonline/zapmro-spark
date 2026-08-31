
-- Create table for license keys
CREATE TABLE public.license_keys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  password TEXT NOT NULL,
  license_key TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_validated_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.license_keys ENABLE ROW LEVEL SECURITY;

-- Only service role can access
CREATE POLICY "Service role full access on license_keys"
  ON public.license_keys FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Settings table for admin credentials
CREATE TABLE public.license_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_email TEXT NOT NULL DEFAULT 'mro@gmail.com',
  admin_password TEXT NOT NULL DEFAULT 'Ga145523@',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.license_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on license_settings"
  ON public.license_settings FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Insert default settings
INSERT INTO public.license_settings (admin_email, admin_password) VALUES ('mro@gmail.com', 'Ga145523@');
