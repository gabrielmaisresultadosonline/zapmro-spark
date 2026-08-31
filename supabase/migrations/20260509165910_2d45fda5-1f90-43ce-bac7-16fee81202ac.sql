CREATE TABLE IF NOT EXISTS public.crm_google_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.crm_google_tokens ENABLE ROW LEVEL SECURITY;

-- Only one row allowed for system settings
CREATE UNIQUE INDEX IF NOT EXISTS crm_google_tokens_single_row ON public.crm_google_tokens ((true));

-- Policies
CREATE POLICY "Admins can view google tokens" ON public.crm_google_tokens FOR SELECT USING (true);
CREATE POLICY "Admins can update google tokens" ON public.crm_google_tokens FOR ALL USING (true);
