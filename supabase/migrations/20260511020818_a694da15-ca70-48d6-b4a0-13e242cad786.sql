ALTER TABLE public.crm_contacts 
ADD COLUMN IF NOT EXISTS flow_timeout_minutes INTEGER DEFAULT 20,
ADD COLUMN IF NOT EXISTS flow_timeout_node_id TEXT;