ALTER TABLE public.crm_messages ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE public.crm_messages ADD COLUMN IF NOT EXISTS error_code TEXT;