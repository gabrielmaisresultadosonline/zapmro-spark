-- Add new AI operation mode columns to crm_settings
ALTER TABLE public.crm_settings 
ADD COLUMN IF NOT EXISTS ai_operation_mode TEXT DEFAULT 'chat' CHECK (ai_operation_mode IN ('chat', 'monitor', 'hybrid')),
ADD COLUMN IF NOT EXISTS auto_generate_strategy BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS strategy_generation_prompt TEXT DEFAULT 'Analise o histórico acima e gere 3 estratégias personalizadas para converter este cliente. Sugira também 2 perguntas que eliminem as principais dúvidas dele.';

-- Add columns to crm_contacts for individual control and storage
ALTER TABLE public.crm_contacts
ADD COLUMN IF NOT EXISTS ai_strategy_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS last_ai_strategy TEXT,
ADD COLUMN IF NOT EXISTS ai_strategy_history JSONB DEFAULT '[]'::jsonb;

-- Comment for clarity
COMMENT ON COLUMN public.crm_settings.ai_operation_mode IS 'Modes: chat (AI talks), monitor (AI only analyzes and moves to CRM), hybrid (both)';
