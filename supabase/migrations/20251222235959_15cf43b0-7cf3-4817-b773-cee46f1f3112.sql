-- Tabela de usuários do método seguidor
CREATE TABLE public.metodo_seguidor_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  instagram_username VARCHAR(100),
  subscription_status VARCHAR(20) DEFAULT 'pending',
  subscription_start TIMESTAMP WITH TIME ZONE,
  subscription_end TIMESTAMP WITH TIME ZONE,
  payment_id VARCHAR(100),
  email_sent BOOLEAN DEFAULT false,
  email_sent_at TIMESTAMP WITH TIME ZONE,
  last_access TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de pedidos do método seguidor
CREATE TABLE public.metodo_seguidor_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nsu_order VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  instagram_username VARCHAR(100),
  amount DECIMAL(10,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  infinitepay_link TEXT,
  paid_at TIMESTAMP WITH TIME ZONE,
  verified_at TIMESTAMP WITH TIME ZONE,
  expired_at TIMESTAMP WITH TIME ZONE,
  user_id UUID REFERENCES public.metodo_seguidor_users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de módulos do método seguidor
CREATE TABLE public.metodo_seguidor_modules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  order_index INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de vídeos/aulas do método seguidor
CREATE TABLE public.metodo_seguidor_videos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  module_id UUID REFERENCES public.metodo_seguidor_modules(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  video_url TEXT,
  video_type VARCHAR(20) DEFAULT 'youtube',
  thumbnail_url TEXT,
  duration VARCHAR(20),
  order_index INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de admins do método seguidor
CREATE TABLE public.metodo_seguidor_admins (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Inserir admin padrão
INSERT INTO public.metodo_seguidor_admins (email, password, name)
VALUES ('mro@gmail.com', 'Ga145523@', 'Admin MRO');

-- Enable RLS
ALTER TABLE public.metodo_seguidor_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metodo_seguidor_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metodo_seguidor_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metodo_seguidor_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metodo_seguidor_admins ENABLE ROW LEVEL SECURITY;

-- Políticas públicas para leitura de módulos e vídeos (área de membros)
CREATE POLICY "Modules are viewable by everyone" ON public.metodo_seguidor_modules FOR SELECT USING (true);
CREATE POLICY "Videos are viewable by everyone" ON public.metodo_seguidor_videos FOR SELECT USING (true);

-- Políticas para service role (edge functions)
CREATE POLICY "Service role can manage users" ON public.metodo_seguidor_users FOR ALL USING (true);
CREATE POLICY "Service role can manage orders" ON public.metodo_seguidor_orders FOR ALL USING (true);
CREATE POLICY "Service role can manage modules" ON public.metodo_seguidor_modules FOR ALL USING (true);
CREATE POLICY "Service role can manage videos" ON public.metodo_seguidor_videos FOR ALL USING (true);
CREATE POLICY "Service role can manage admins" ON public.metodo_seguidor_admins FOR ALL USING (true);

-- Triggers para updated_at
CREATE OR REPLACE FUNCTION public.update_metodo_seguidor_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_metodo_seguidor_users_updated_at
  BEFORE UPDATE ON public.metodo_seguidor_users
  FOR EACH ROW EXECUTE FUNCTION public.update_metodo_seguidor_updated_at();

CREATE TRIGGER update_metodo_seguidor_orders_updated_at
  BEFORE UPDATE ON public.metodo_seguidor_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_metodo_seguidor_updated_at();

CREATE TRIGGER update_metodo_seguidor_modules_updated_at
  BEFORE UPDATE ON public.metodo_seguidor_modules
  FOR EACH ROW EXECUTE FUNCTION public.update_metodo_seguidor_updated_at();

CREATE TRIGGER update_metodo_seguidor_videos_updated_at
  BEFORE UPDATE ON public.metodo_seguidor_videos
  FOR EACH ROW EXECUTE FUNCTION public.update_metodo_seguidor_updated_at();