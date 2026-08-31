
-- Create v2 tables for /rendaextra2 (separate database, starts from zero)
CREATE TABLE public.renda_extra_v2_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_completo text NOT NULL,
  email text NOT NULL,
  whatsapp text NOT NULL,
  trabalha_atualmente text,
  media_salarial text,
  tipo_computador text,
  instagram_username text,
  email_confirmacao_enviado boolean DEFAULT false,
  email_confirmacao_enviado_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.renda_extra_v2_email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.renda_extra_v2_leads(id) ON DELETE CASCADE,
  email_to text NOT NULL,
  email_type text NOT NULL,
  subject text,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.renda_extra_v2_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  source_url text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.renda_extra_v2_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_email text NOT NULL DEFAULT 'mro@gmail.com',
  admin_password text NOT NULL DEFAULT 'Ga145523@',
  whatsapp_group_link text,
  launch_date timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.renda_extra_v2_settings (admin_email, admin_password) VALUES ('mro@gmail.com', 'Ga145523@');

ALTER TABLE public.renda_extra_v2_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.renda_extra_v2_email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.renda_extra_v2_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.renda_extra_v2_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only on renda_extra_v2_leads" ON public.renda_extra_v2_leads FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "Service role only on renda_extra_v2_email_logs" ON public.renda_extra_v2_email_logs FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "Anyone can insert v2 analytics" ON public.renda_extra_v2_analytics FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role full v2 analytics" ON public.renda_extra_v2_analytics FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "Service role only on renda_extra_v2_settings" ON public.renda_extra_v2_settings FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
