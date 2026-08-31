-- Add visual state columns to crm_flows
ALTER TABLE public.crm_flows 
ADD COLUMN IF NOT EXISTS nodes JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS edges JSONB DEFAULT '[]';

-- Add tracking columns to crm_contacts
ALTER TABLE public.crm_contacts 
ADD COLUMN IF NOT EXISTS current_node_id TEXT;

-- Create table for scheduled messages (delays/follow-ups)
CREATE TABLE IF NOT EXISTS public.crm_scheduled_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  flow_id UUID REFERENCES public.crm_flows(id) ON DELETE CASCADE,
  node_id TEXT,
  scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
  message_data JSONB NOT NULL,
  status TEXT DEFAULT 'pending', -- pending, sent, cancelled
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on crm_scheduled_messages
ALTER TABLE public.crm_scheduled_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow full access to crm_scheduled_messages" ON public.crm_scheduled_messages FOR ALL USING (true);

-- Create table for flow executions/state
CREATE TABLE IF NOT EXISTS public.crm_flow_executions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  flow_id UUID REFERENCES public.crm_flows(id) ON DELETE CASCADE,
  current_node_id TEXT,
  state JSONB DEFAULT '{}',
  last_interaction TIMESTAMP WITH TIME ZONE DEFAULT now(),
  waiting_since TIMESTAMP WITH TIME ZONE,
  waiting_for_type TEXT, -- response, delay
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on crm_flow_executions
ALTER TABLE public.crm_flow_executions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow full access to crm_flow_executions" ON public.crm_flow_executions FOR ALL USING (true);

-- Function to clean up/update executions
CREATE OR REPLACE FUNCTION public.update_crm_flow_execution_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_crm_flow_execution_timestamp
BEFORE UPDATE ON public.crm_flow_executions
FOR EACH ROW EXECUTE FUNCTION public.update_crm_flow_execution_timestamp();
