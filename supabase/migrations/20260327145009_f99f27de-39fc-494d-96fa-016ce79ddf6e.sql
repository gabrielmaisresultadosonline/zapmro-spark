
-- Add CRM fields to zapi_contacts
ALTER TABLE public.zapi_contacts 
ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS crm_status text DEFAULT 'novo',
ADD COLUMN IF NOT EXISTS source text DEFAULT 'organico',
ADD COLUMN IF NOT EXISTS notes text,
ADD COLUMN IF NOT EXISTS is_hot_lead boolean DEFAULT false;

-- Flows table
CREATE TABLE public.zapi_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  trigger_type text NOT NULL DEFAULT 'manual',
  trigger_keywords text[] DEFAULT '{}',
  trigger_on_first_message boolean DEFAULT false,
  trigger_on_specific_message boolean DEFAULT false,
  trigger_specific_text text,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.zapi_flows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on zapi_flows" ON public.zapi_flows FOR ALL USING (auth.role() = 'service_role'::text) WITH CHECK (auth.role() = 'service_role'::text);

-- Flow steps table
CREATE TABLE public.zapi_flow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid REFERENCES public.zapi_flows(id) ON DELETE CASCADE NOT NULL,
  step_order integer NOT NULL DEFAULT 0,
  step_type text NOT NULL DEFAULT 'text',
  content text,
  media_url text,
  delay_seconds integer DEFAULT 2,
  simulate_typing boolean DEFAULT true,
  typing_duration_ms integer DEFAULT 3000,
  wait_for_reply boolean DEFAULT false,
  wait_timeout_seconds integer DEFAULT 300,
  button_text text,
  button_options jsonb DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.zapi_flow_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on zapi_flow_steps" ON public.zapi_flow_steps FOR ALL USING (auth.role() = 'service_role'::text) WITH CHECK (auth.role() = 'service_role'::text);

-- Flow executions tracking
CREATE TABLE public.zapi_flow_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid REFERENCES public.zapi_flows(id) ON DELETE CASCADE NOT NULL,
  phone text NOT NULL,
  current_step integer DEFAULT 0,
  status text DEFAULT 'running',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  paused_at timestamptz,
  last_step_at timestamptz
);

ALTER TABLE public.zapi_flow_executions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on zapi_flow_executions" ON public.zapi_flow_executions FOR ALL USING (auth.role() = 'service_role'::text) WITH CHECK (auth.role() = 'service_role'::text);
