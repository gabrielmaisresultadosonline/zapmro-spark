ALTER TABLE public.crm_settings 
ALTER COLUMN ai_system_prompt TYPE TEXT,
ALTER COLUMN business_description TYPE TEXT;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_settings TO authenticated;
GRANT ALL ON public.crm_settings TO service_role;
