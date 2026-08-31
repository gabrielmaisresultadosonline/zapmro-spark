ALTER TABLE public.crm_settings 
ADD COLUMN IF NOT EXISTS ai_agent_prompt TEXT,
ADD COLUMN IF NOT EXISTS ai_agent_label_on_transfer TEXT;

COMMENT ON COLUMN public.crm_settings.ai_agent_prompt IS 'Prompt global do cérebro da IA para o usuário';
COMMENT ON COLUMN public.crm_settings.ai_agent_label_on_transfer IS 'Etiqueta padrão para quando a IA transfere para humano';