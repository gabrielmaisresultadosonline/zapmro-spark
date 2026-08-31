ALTER TABLE public.crm_settings ADD COLUMN IF NOT EXISTS initial_flow_id UUID REFERENCES public.crm_flows(id);
