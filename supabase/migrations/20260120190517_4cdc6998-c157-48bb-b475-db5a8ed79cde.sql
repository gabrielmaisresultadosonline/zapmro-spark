-- Tabela de usuários do Corretor MRO
CREATE TABLE public.corretor_users (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    days_remaining INTEGER NOT NULL DEFAULT 30,
    subscription_start TIMESTAMP WITH TIME ZONE DEFAULT now(),
    subscription_end TIMESTAMP WITH TIME ZONE,
    last_access TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de configurações do admin
CREATE TABLE public.corretor_settings (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    setting_key TEXT NOT NULL UNIQUE,
    setting_value TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de avisos/popups
CREATE TABLE public.corretor_announcements (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT,
    image_url TEXT,
    video_url TEXT,
    is_active BOOLEAN DEFAULT true,
    is_blocking BOOLEAN DEFAULT false,
    display_duration INTEGER DEFAULT 0,
    start_date TIMESTAMP WITH TIME ZONE DEFAULT now(),
    end_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de visualizações de avisos
CREATE TABLE public.corretor_announcement_views (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    announcement_id UUID NOT NULL REFERENCES public.corretor_announcements(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.corretor_users(id) ON DELETE CASCADE,
    viewed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(announcement_id, user_id)
);

-- Inserir configuração inicial da API
INSERT INTO public.corretor_settings (setting_key, setting_value) 
VALUES ('openai_api_key', '');

-- Inserir configuração do admin
INSERT INTO public.corretor_settings (setting_key, setting_value) 
VALUES ('admin_email', 'mro@gmail.com');

INSERT INTO public.corretor_settings (setting_key, setting_value) 
VALUES ('admin_password', 'Ga145523@');

-- Enable RLS
ALTER TABLE public.corretor_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corretor_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corretor_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corretor_announcement_views ENABLE ROW LEVEL SECURITY;

-- Políticas públicas para leitura (a extensão precisa acessar)
CREATE POLICY "Allow public read on corretor_users" ON public.corretor_users FOR SELECT USING (true);
CREATE POLICY "Allow public read on corretor_settings" ON public.corretor_settings FOR SELECT USING (true);
CREATE POLICY "Allow public read on corretor_announcements" ON public.corretor_announcements FOR SELECT USING (true);
CREATE POLICY "Allow public read on corretor_announcement_views" ON public.corretor_announcement_views FOR SELECT USING (true);

-- Políticas de inserção/atualização
CREATE POLICY "Allow public insert on corretor_announcement_views" ON public.corretor_announcement_views FOR INSERT WITH CHECK (true);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION public.update_corretor_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_corretor_users_updated_at
BEFORE UPDATE ON public.corretor_users
FOR EACH ROW EXECUTE FUNCTION public.update_corretor_updated_at();

CREATE TRIGGER update_corretor_settings_updated_at
BEFORE UPDATE ON public.corretor_settings
FOR EACH ROW EXECUTE FUNCTION public.update_corretor_updated_at();

CREATE TRIGGER update_corretor_announcements_updated_at
BEFORE UPDATE ON public.corretor_announcements
FOR EACH ROW EXECUTE FUNCTION public.update_corretor_updated_at();