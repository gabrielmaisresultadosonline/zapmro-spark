-- Tabela de cadastros da landing page Renda Extra
CREATE TABLE public.renda_extra_leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome_completo TEXT NOT NULL,
  email TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  trabalha_atualmente BOOLEAN DEFAULT false,
  media_salarial TEXT NOT NULL,
  tipo_computador TEXT NOT NULL,
  instagram_username TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  email_confirmacao_enviado BOOLEAN DEFAULT false,
  email_confirmacao_enviado_at TIMESTAMP WITH TIME ZONE,
  email_lembrete_enviado BOOLEAN DEFAULT false,
  email_lembrete_enviado_at TIMESTAMP WITH TIME ZONE
);

-- Tabela de configurações do admin
CREATE TABLE public.renda_extra_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  whatsapp_group_link TEXT,
  launch_date TIMESTAMP WITH TIME ZONE DEFAULT '2026-01-21T09:00:00Z',
  admin_email TEXT DEFAULT 'mro@gmail.com',
  admin_password TEXT DEFAULT 'Ga145523@',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de analytics de visitas
CREATE TABLE public.renda_extra_analytics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL,
  source_url TEXT,
  user_agent TEXT,
  device_type TEXT,
  referrer TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de log de emails
CREATE TABLE public.renda_extra_email_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID REFERENCES public.renda_extra_leads(id),
  email_to TEXT NOT NULL,
  email_type TEXT NOT NULL,
  subject TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS em todas as tabelas
ALTER TABLE public.renda_extra_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.renda_extra_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.renda_extra_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.renda_extra_email_logs ENABLE ROW LEVEL SECURITY;

-- Políticas para renda_extra_leads (acesso público para insert, service role para select/update)
CREATE POLICY "Anyone can register as lead"
ON public.renda_extra_leads FOR INSERT
TO public
WITH CHECK (true);

CREATE POLICY "Service role can manage leads"
ON public.renda_extra_leads FOR ALL
TO public
USING ((SELECT auth.role()) = 'service_role');

-- Políticas para renda_extra_settings
CREATE POLICY "Service role can manage settings"
ON public.renda_extra_settings FOR ALL
TO public
USING ((SELECT auth.role()) = 'service_role');

-- Políticas para renda_extra_analytics
CREATE POLICY "Anyone can track visits"
ON public.renda_extra_analytics FOR INSERT
TO public
WITH CHECK (true);

CREATE POLICY "Service role can view analytics"
ON public.renda_extra_analytics FOR SELECT
TO public
USING ((SELECT auth.role()) = 'service_role');

-- Políticas para renda_extra_email_logs
CREATE POLICY "Service role can manage email logs"
ON public.renda_extra_email_logs FOR ALL
TO public
USING ((SELECT auth.role()) = 'service_role');

-- Inserir configuração padrão
INSERT INTO public.renda_extra_settings (whatsapp_group_link, launch_date, admin_email, admin_password)
VALUES ('https://chat.whatsapp.com/example', '2026-01-21T09:00:00Z', 'mro@gmail.com', 'Ga145523@');