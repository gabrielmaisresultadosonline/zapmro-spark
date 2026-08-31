ALTER TABLE public.crm_contacts ADD COLUMN source_type TEXT DEFAULT 'system';
COMMENT ON COLUMN public.crm_contacts.source_type IS 'To distinguish between system generated contacts and imported ones';