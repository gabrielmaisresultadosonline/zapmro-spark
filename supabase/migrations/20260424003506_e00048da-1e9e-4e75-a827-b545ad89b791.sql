-- Duplicate tables for /rendaext (separate from /rendaextra2)

CREATE TABLE public.rendaext_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_email text NOT NULL DEFAULT 'mro@gmail.com',
  admin_password text NOT NULL DEFAULT 'Ga145523@',
  whatsapp_group_link text,
  launch_date timestamptz,
  session_secret text NOT NULL DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.rendaext_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only on rendaext_settings" ON public.rendaext_settings FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
INSERT INTO public.rendaext_settings (admin_email, admin_password) VALUES ('mro@gmail.com', 'Ga145523@');

CREATE TABLE public.rendaext_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_completo text NOT NULL,
  email text NOT NULL,
  whatsapp text NOT NULL,
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.rendaext_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only on rendaext_leads" ON public.rendaext_leads FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE TABLE public.rendaext_email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.rendaext_leads(id) ON DELETE SET NULL,
  recipient_email text NOT NULL,
  subject text,
  status text NOT NULL DEFAULT 'sent',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.rendaext_email_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only on rendaext_email_logs" ON public.rendaext_email_logs FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE TABLE public.rendaext_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  user_agent text,
  referrer text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.rendaext_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only on rendaext_analytics" ON public.rendaext_analytics FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "Anyone can insert rendaext_analytics" ON public.rendaext_analytics FOR INSERT WITH CHECK (true);

-- Separate WhatsApp bot tables
CREATE TABLE public.wpp_bot_session_v2 (
  id text PRIMARY KEY,
  status text NOT NULL DEFAULT 'disconnected',
  request_qr boolean NOT NULL DEFAULT false,
  request_logout boolean NOT NULL DEFAULT false,
  qr_code text,
  phone_number text,
  last_heartbeat timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.wpp_bot_session_v2 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only on wpp_bot_session_v2" ON public.wpp_bot_session_v2 FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE TABLE public.wpp_bot_settings_v2 (
  id text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  delay_minutes integer NOT NULL DEFAULT 30,
  message_template text NOT NULL DEFAULT 'Olá! Vi seu cadastro e queria te explicar melhor como funciona.',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.wpp_bot_settings_v2 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only on wpp_bot_settings_v2" ON public.wpp_bot_settings_v2 FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE TABLE public.wpp_bot_messages_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid,
  lead_name text,
  phone text NOT NULL,
  message text NOT NULL,
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.wpp_bot_messages_v2 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only on wpp_bot_messages_v2" ON public.wpp_bot_messages_v2 FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE INDEX idx_wpp_bot_messages_v2_status_scheduled ON public.wpp_bot_messages_v2(status, scheduled_for);
CREATE INDEX idx_rendaext_leads_created ON public.rendaext_leads(created_at DESC);