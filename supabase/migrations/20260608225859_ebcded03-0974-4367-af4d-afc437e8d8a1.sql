ALTER TABLE public.crm_settings 
ADD COLUMN IF NOT EXISTS countdown_trigger_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS countdown_trigger_threshold_minutes INTEGER DEFAULT 60,
ADD COLUMN IF NOT EXISTS countdown_trigger_message_type TEXT DEFAULT 'message',
ADD COLUMN IF NOT EXISTS countdown_trigger_content TEXT,
ADD COLUMN IF NOT EXISTS countdown_trigger_flow_id UUID,
ADD COLUMN IF NOT EXISTS countdown_trigger_template_id TEXT;

ALTER TABLE public.crm_contacts
ADD COLUMN IF NOT EXISTS countdown_trigger_sent_at TIMESTAMP WITH TIME ZONE;

GRANT ALL ON public.crm_settings TO service_role;
GRANT ALL ON public.crm_contacts TO service_role;
