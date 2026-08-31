CREATE INDEX IF NOT EXISTS idx_crm_messages_created_at ON public.crm_messages (created_at);
CREATE INDEX IF NOT EXISTS idx_crm_messages_direction_created_at ON public.crm_messages (direction, created_at);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_updated_at ON public.crm_contacts (updated_at);
GRANT SELECT ON public.crm_messages TO authenticated;
GRANT SELECT ON public.crm_contacts TO authenticated;
GRANT ALL ON public.crm_messages TO service_role;
GRANT ALL ON public.crm_contacts TO service_role;
