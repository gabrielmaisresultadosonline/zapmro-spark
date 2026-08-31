ALTER TABLE public.crm_webhooks 
ADD COLUMN default_status TEXT NOT NULL DEFAULT 'new';

-- Add a check constraint to ensure valid status
ALTER TABLE public.crm_webhooks 
ADD CONSTRAINT valid_default_status CHECK (default_status IN ('new', 'responded', 'qualified', 'human', 'closed', 'lost'));