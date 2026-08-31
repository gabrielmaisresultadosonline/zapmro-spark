ALTER TABLE public.crm_settings
  ADD COLUMN IF NOT EXISTS meta_display_phone_number text,
  ADD COLUMN IF NOT EXISTS meta_verified_name text;