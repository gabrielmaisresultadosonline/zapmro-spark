ALTER TABLE public.crm_contacts ADD COLUMN IF NOT EXISTS ai_agent_prompt TEXT;
GRANT ALL ON public.crm_contacts TO service_role;
GRANT ALL ON public.crm_contacts TO authenticated;