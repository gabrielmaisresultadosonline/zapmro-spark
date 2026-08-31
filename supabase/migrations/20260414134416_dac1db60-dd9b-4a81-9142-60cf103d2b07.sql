
CREATE TABLE public.renda_extra_aula_leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome_completo TEXT NOT NULL,
  email TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  aula_liberada BOOLEAN DEFAULT false,
  email_enviado BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.renda_extra_aula_analytics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL,
  source_url TEXT,
  user_agent TEXT,
  device_type TEXT,
  referrer TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.renda_extra_aula_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_email TEXT NOT NULL DEFAULT 'mro@gmail.com',
  admin_password TEXT NOT NULL DEFAULT 'Ga145523@',
  youtube_url TEXT DEFAULT 'https://www.youtube.com/watch?v=-0CHlqHVe0g',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.renda_extra_aula_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.renda_extra_aula_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.renda_extra_aula_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on renda_extra_aula_leads" ON public.renda_extra_aula_leads FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "Service role full access on renda_extra_aula_analytics" ON public.renda_extra_aula_analytics FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "Service role full access on renda_extra_aula_settings" ON public.renda_extra_aula_settings FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

INSERT INTO public.renda_extra_aula_settings (admin_email, admin_password) VALUES ('mro@gmail.com', 'Ga145523@');
