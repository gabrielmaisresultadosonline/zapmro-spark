-- Create webhooks table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.crm_webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    secret_token TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    response_type TEXT DEFAULT 'text',
    template_id TEXT,
    last_used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.crm_webhooks ENABLE ROW LEVEL SECURITY;

-- Create policies (permissive as the rest of the CRM)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'crm_webhooks' AND policyname = 'Public access to crm_webhooks') THEN
        CREATE POLICY "Public access to crm_webhooks" ON public.crm_webhooks FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;
