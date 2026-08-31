-- Create table for multiple Google accounts
CREATE TABLE IF NOT EXISTS public.crm_google_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expiry_date BIGINT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.crm_google_accounts ENABLE ROW LEVEL SECURITY;

-- Allow all for now (matching existing CRM pattern if needed, or restricted to auth)
CREATE POLICY "Enable all for authenticated users" ON public.crm_google_accounts FOR ALL USING (true);

-- Add column to crm_contacts to track which account it belongs to
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'crm_contacts' AND column_name = 'google_sync_account_id') THEN
        ALTER TABLE public.crm_contacts ADD COLUMN google_sync_account_id UUID REFERENCES public.crm_google_accounts(id);
    END IF;
END $$;
