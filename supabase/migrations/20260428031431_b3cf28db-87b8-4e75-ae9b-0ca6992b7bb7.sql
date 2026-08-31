ALTER TABLE public.crm_contacts 
ADD COLUMN IF NOT EXISTS custom_labels TEXT[] DEFAULT '{}';

COMMENT ON COLUMN public.crm_contacts.custom_labels IS 'Labels for contact qualification and Kanban board stages.';