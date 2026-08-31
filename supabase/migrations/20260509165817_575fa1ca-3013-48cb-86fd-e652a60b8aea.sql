ALTER TABLE public.crm_settings 
ADD COLUMN IF NOT EXISTS google_auto_sync BOOLEAN DEFAULT false;