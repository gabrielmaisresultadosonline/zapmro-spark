-- Add ai_system_prompt to crm_settings
ALTER TABLE public.crm_settings 
ADD COLUMN IF NOT EXISTS ai_system_prompt TEXT DEFAULT 'Você é um assistente de vendas profissional para a empresa Mais Resultados Online. Responda em Português do Brasil.';

-- Add ai_active to crm_contacts
ALTER TABLE public.crm_contacts 
ADD COLUMN IF NOT EXISTS ai_active BOOLEAN DEFAULT true;

-- Update existing contacts to have ai_active = true
UPDATE public.crm_contacts SET ai_active = true WHERE ai_active IS NULL;
