-- Update crm_flow_steps to support media and more types
ALTER TABLE public.crm_flow_steps 
ADD COLUMN IF NOT EXISTS step_type TEXT DEFAULT 'text' CHECK (step_type IN ('text', 'audio', 'image', 'video', 'document', 'wait_response', 'delay')),
ADD COLUMN IF NOT EXISTS media_url TEXT,
ADD COLUMN IF NOT EXISTS media_type TEXT;

-- Update crm_contacts to track automation state
ALTER TABLE public.crm_contacts 
ADD COLUMN IF NOT EXISTS current_flow_id UUID REFERENCES public.crm_flows(id),
ADD COLUMN IF NOT EXISTS current_step_index INTEGER,
ADD COLUMN IF NOT EXISTS flow_state TEXT DEFAULT 'idle' CHECK (flow_state IN ('idle', 'running', 'waiting_response', 'waiting_delay')),
ADD COLUMN IF NOT EXISTS last_flow_interaction TIMESTAMP WITH TIME ZONE;

-- Add triggers to crm_flows if not already improved
ALTER TABLE public.crm_flows 
ADD COLUMN IF NOT EXISTS trigger_type TEXT DEFAULT 'keyword' CHECK (trigger_type IN ('keyword', 'all_messages', 'first_message')),
ADD COLUMN IF NOT EXISTS trigger_keywords TEXT[]; -- Array of keywords

-- Create a table for CRM activities (audit log/events)
CREATE TABLE IF NOT EXISTS public.crm_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES public.crm_contacts(id),
  activity_type TEXT NOT NULL,
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS for activities
ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public activities access" ON public.crm_activities FOR ALL USING (true) WITH CHECK (true);
