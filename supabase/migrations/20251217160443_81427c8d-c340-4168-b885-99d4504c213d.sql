-- Table to store created user accesses for WhatsApp and Instagram APIs
CREATE TABLE public.created_accesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_email TEXT NOT NULL,
  customer_name TEXT,
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  service_type TEXT NOT NULL CHECK (service_type IN ('whatsapp', 'instagram')),
  access_type TEXT NOT NULL CHECK (access_type IN ('annual', 'lifetime', 'monthly')),
  days_access INTEGER DEFAULT 365,
  api_created BOOLEAN DEFAULT false,
  email_sent BOOLEAN DEFAULT false,
  email_sent_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.created_accesses ENABLE ROW LEVEL SECURITY;

-- Only service role can access (admin operations via edge functions)
CREATE POLICY "Service role full access on created_accesses"
ON public.created_accesses
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.update_created_accesses_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_created_accesses_updated_at
BEFORE UPDATE ON public.created_accesses
FOR EACH ROW
EXECUTE FUNCTION public.update_created_accesses_updated_at();