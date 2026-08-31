-- Add business hours settings to crm_settings
ALTER TABLE public.crm_settings 
ADD COLUMN IF NOT EXISTS business_hours_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS business_hours_start TEXT DEFAULT '08:00',
ADD COLUMN IF NOT EXISTS business_hours_end TEXT DEFAULT '18:00',
ADD COLUMN IF NOT EXISTS business_hours_tz TEXT DEFAULT 'America/Sao_Paulo',
ADD COLUMN IF NOT EXISTS outside_hours_message TEXT DEFAULT 'Nossos administradores não estão ativos no momento. Seguiremos com o atendimento automatizado e em breve retornaremos com um atendimento humano.';

-- Update the existing settings row if it exists
UPDATE public.crm_settings 
SET 
  business_hours_enabled = false,
  business_hours_start = '08:00',
  business_hours_end = '18:00',
  business_hours_tz = 'America/Sao_Paulo',
  outside_hours_message = 'Nossos administradores não estão ativos no momento. Seguiremos com o atendimento automatizado e em breve retornaremos com um atendimento humano.'
WHERE id = '00000000-0000-0000-0000-000000000001';
