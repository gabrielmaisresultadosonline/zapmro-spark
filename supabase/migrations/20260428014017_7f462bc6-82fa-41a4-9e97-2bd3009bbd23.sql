-- CRM Settings table
CREATE TABLE IF NOT EXISTS public.crm_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meta_access_token TEXT,
    meta_phone_number_id TEXT,
    meta_waba_id TEXT,
    meta_app_id TEXT,
    meta_app_secret TEXT,
    webhook_verify_token TEXT DEFAULT gen_random_uuid()::text,
    initial_auto_response_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- CRM Flows table
CREATE TABLE IF NOT EXISTS public.crm_flows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    trigger_keyword TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- CRM Flow Steps table
CREATE TABLE IF NOT EXISTS public.crm_flow_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flow_id UUID REFERENCES public.crm_flows(id) ON DELETE CASCADE,
    step_order INTEGER NOT NULL,
    message_text TEXT,
    buttons JSONB, -- Array of button objects {text, id, payload}
    delay_seconds INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- CRM Contacts table
CREATE TABLE IF NOT EXISTS public.crm_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wa_id TEXT UNIQUE NOT NULL, -- WhatsApp ID (phone number)
    name TEXT,
    last_interaction TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- CRM Messages table
CREATE TABLE IF NOT EXISTS public.crm_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id UUID REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
    direction TEXT CHECK (direction IN ('inbound', 'outbound')),
    message_type TEXT DEFAULT 'text',
    content TEXT,
    meta_message_id TEXT,
    status TEXT, -- sent, delivered, read, failed
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- CRM Broadcasts (Bulk Messaging)
CREATE TABLE IF NOT EXISTS public.crm_broadcasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    message_text TEXT NOT NULL,
    buttons JSONB,
    status TEXT DEFAULT 'pending', -- pending, sending, completed, failed
    total_contacts INTEGER DEFAULT 0,
    sent_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.crm_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_flow_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_broadcasts ENABLE ROW LEVEL SECURITY;

-- Simple policies (will restrict to authenticated users with admin role in practice)
-- For now, allow authenticated users
CREATE POLICY "Allow authenticated access to CRM settings" ON public.crm_settings FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow authenticated access to CRM flows" ON public.crm_flows FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow authenticated access to CRM flow steps" ON public.crm_flow_steps FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow authenticated access to CRM contacts" ON public.crm_contacts FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow authenticated access to CRM messages" ON public.crm_messages FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow authenticated access to CRM broadcasts" ON public.crm_broadcasts FOR ALL TO authenticated USING (true);

-- Insert initial settings row if not exists
INSERT INTO public.crm_settings (id) VALUES ('00000000-0000-0000-0000-000000000001') ON CONFLICT (id) DO NOTHING;
