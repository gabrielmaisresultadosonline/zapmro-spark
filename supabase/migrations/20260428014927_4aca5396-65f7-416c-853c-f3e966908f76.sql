-- Update crm_settings for AI
ALTER TABLE public.crm_settings 
ADD COLUMN IF NOT EXISTS openai_api_key TEXT,
ADD COLUMN IF NOT EXISTS ai_agent_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS ai_agent_trigger TEXT DEFAULT 'first_message'; -- 'all', 'first_message', 'keyword'

-- Update crm_contacts for Sales Funnel and Analytics
ALTER TABLE public.crm_contacts 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'new', -- 'new', 'responded', 'qualified', 'closed', 'lost'
ADD COLUMN IF NOT EXISTS is_qualified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS sale_closed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS total_messages_received INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_messages_sent INTEGER DEFAULT 0;

-- Create crm_metrics for history (Optional but helpful)
CREATE TABLE IF NOT EXISTS public.crm_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE UNIQUE DEFAULT CURRENT_DATE,
    sent_count INTEGER DEFAULT 0,
    responded_count INTEGER DEFAULT 0,
    qualified_count INTEGER DEFAULT 0,
    sales_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Policy update (ensure RLS is on and allowing operations for authenticated)
-- Assuming admin access is handled by simple auth in this app context
ALTER TABLE public.crm_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated users" ON public.crm_metrics FOR ALL USING (true);
