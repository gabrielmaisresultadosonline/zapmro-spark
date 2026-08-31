-- Create function for updating timestamps if it doesn't exist
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.crm_webhooks (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    secret_token TEXT NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
    is_active BOOLEAN NOT NULL DEFAULT true,
    response_type TEXT NOT NULL DEFAULT 'text', -- 'text' or 'template'
    template_id TEXT REFERENCES public.crm_templates(id),
    last_used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.crm_webhooks ENABLE ROW LEVEL SECURITY;

-- Allow all for now as it's an admin CRM
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.crm_webhooks;
CREATE POLICY "Allow all for authenticated users" ON public.crm_webhooks
    FOR ALL USING (true);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_crm_webhooks_updated_at ON public.crm_webhooks;
CREATE TRIGGER update_crm_webhooks_updated_at
BEFORE UPDATE ON public.crm_webhooks
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();
