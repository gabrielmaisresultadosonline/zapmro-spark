
-- Live sessions table
CREATE TABLE public.live_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'Fazendo 5k com a MRO',
  description TEXT,
  video_url TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- active, paused, ended
  fake_viewers_min INTEGER NOT NULL DEFAULT 14,
  fake_viewers_max INTEGER NOT NULL DEFAULT 200,
  whatsapp_group_link TEXT,
  cta_title TEXT DEFAULT 'Fature mais de 5k prestando serviço para as empresas',
  cta_description TEXT DEFAULT 'Rode a ferramenta na sua maquina/notebook/pc e cobre mensalmente das empresas por isso. Receba todo o passo a passo de como fechar contratos, de como apresentar esse serviço e como faturar de verdade.',
  cta_button_text TEXT DEFAULT 'Acesse o GRUPO para liberar o desconto',
  cta_button_link TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ended_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.live_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on live_sessions" ON public.live_sessions FOR ALL USING (auth.role() = 'service_role'::text) WITH CHECK (auth.role() = 'service_role'::text);
CREATE POLICY "Anyone can read active live" ON public.live_sessions FOR SELECT USING (true);

-- Live analytics table
CREATE TABLE public.live_analytics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  visitor_id TEXT NOT NULL,
  watch_percentage INTEGER NOT NULL DEFAULT 0,
  device_type TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.live_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on live_analytics" ON public.live_analytics FOR ALL USING (auth.role() = 'service_role'::text) WITH CHECK (auth.role() = 'service_role'::text);
CREATE POLICY "Anyone can insert analytics" ON public.live_analytics FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update own analytics" ON public.live_analytics FOR UPDATE USING (true);

-- Live settings
CREATE TABLE public.live_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_email TEXT NOT NULL DEFAULT 'mro@gmail.com',
  admin_password TEXT NOT NULL DEFAULT 'Ga145523@',
  default_whatsapp_group TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.live_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on live_settings" ON public.live_settings FOR ALL USING (auth.role() = 'service_role'::text) WITH CHECK (auth.role() = 'service_role'::text);

-- Insert default settings
INSERT INTO public.live_settings (admin_email, admin_password) VALUES ('mro@gmail.com', 'Ga145523@');
