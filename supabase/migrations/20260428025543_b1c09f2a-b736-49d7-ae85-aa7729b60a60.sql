-- Ensure replica identity is set to FULL for real-time updates to include all columns
ALTER TABLE public.crm_contacts REPLICA IDENTITY FULL;
ALTER TABLE public.crm_messages REPLICA IDENTITY FULL;

-- Add comment to help identify the webhook URL
COMMENT ON TABLE public.crm_settings IS 'Armazena as configurações de integração com a Meta Cloud API';

-- Ensure the webhook verify token is always present
UPDATE public.crm_settings 
SET webhook_verify_token = '0999a884-d967-404e-afff-6a9c8c155299' 
WHERE id = '00000000-0000-0000-0000-000000000001' AND (webhook_verify_token IS NULL OR webhook_verify_token = '');
