-- Add column for AI analysis history to contacts
ALTER TABLE public.crm_contacts 
ADD COLUMN IF NOT EXISTS ai_analysis_history JSONB DEFAULT '[]'::jsonb;

-- Ensure indexes for performance
CREATE INDEX IF NOT EXISTS idx_crm_contacts_ai_analysis_history ON public.crm_contacts USING GIN (ai_analysis_history);