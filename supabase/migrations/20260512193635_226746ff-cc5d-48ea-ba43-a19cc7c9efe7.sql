ALTER TABLE public.crm_contacts ADD COLUMN last_message_received_at TIMESTAMP WITH TIME ZONE;

-- Add index for performance on window checks
CREATE INDEX idx_crm_contacts_last_message_received_at ON public.crm_contacts (last_message_received_at);