ALTER TABLE public.crm_settings
  ADD COLUMN IF NOT EXISTS business_description TEXT,
  ADD COLUMN IF NOT EXISTS meta_business_id TEXT;