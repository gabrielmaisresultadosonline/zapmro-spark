-- Create table for admin users
CREATE TABLE public.inteligencia_fotos_admins (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for regular users
CREATE TABLE public.inteligencia_fotos_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_access TIMESTAMP WITH TIME ZONE
);

-- Create table for image templates (admin saves image + prompt)
CREATE TABLE public.inteligencia_fotos_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  image_url TEXT NOT NULL,
  prompt TEXT NOT NULL,
  title TEXT,
  description TEXT,
  category TEXT,
  is_active BOOLEAN DEFAULT true,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for user generations history
CREATE TABLE public.inteligencia_fotos_generations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.inteligencia_fotos_users(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.inteligencia_fotos_templates(id) ON DELETE SET NULL,
  input_image_url TEXT NOT NULL,
  generated_image_url TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'post',
  saved BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for settings (API token, etc)
CREATE TABLE public.inteligencia_fotos_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_key TEXT NOT NULL UNIQUE,
  setting_value TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.inteligencia_fotos_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inteligencia_fotos_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inteligencia_fotos_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inteligencia_fotos_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inteligencia_fotos_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Service role only for sensitive tables
CREATE POLICY "Service role only on inteligencia_fotos_admins"
ON public.inteligencia_fotos_admins FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role only on inteligencia_fotos_users"
ON public.inteligencia_fotos_users FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role only on inteligencia_fotos_settings"
ON public.inteligencia_fotos_settings FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Templates can be read publicly (for gallery), managed by service role
CREATE POLICY "Anyone can read active templates"
ON public.inteligencia_fotos_templates FOR SELECT
USING (is_active = true);

CREATE POLICY "Service role can manage templates"
ON public.inteligencia_fotos_templates FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Generations - service role only
CREATE POLICY "Service role only on generations"
ON public.inteligencia_fotos_generations FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Create storage bucket for inteligencia fotos
INSERT INTO storage.buckets (id, name, public) 
VALUES ('inteligencia-fotos', 'inteligencia-fotos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Anyone can read inteligencia-fotos"
ON storage.objects FOR SELECT
USING (bucket_id = 'inteligencia-fotos');

CREATE POLICY "Service role can manage inteligencia-fotos"
ON storage.objects FOR ALL
USING (bucket_id = 'inteligencia-fotos' AND auth.role() = 'service_role')
WITH CHECK (bucket_id = 'inteligencia-fotos' AND auth.role() = 'service_role');

-- Insert default admin
INSERT INTO public.inteligencia_fotos_admins (email, password, name)
VALUES ('admin@inteligenciafotos.com', 'Admin123@', 'Administrador');

-- Create updated_at triggers
CREATE OR REPLACE FUNCTION public.update_inteligencia_fotos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_inteligencia_fotos_users_updated_at
BEFORE UPDATE ON public.inteligencia_fotos_users
FOR EACH ROW EXECUTE FUNCTION public.update_inteligencia_fotos_updated_at();

CREATE TRIGGER update_inteligencia_fotos_templates_updated_at
BEFORE UPDATE ON public.inteligencia_fotos_templates
FOR EACH ROW EXECUTE FUNCTION public.update_inteligencia_fotos_updated_at();

CREATE TRIGGER update_inteligencia_fotos_settings_updated_at
BEFORE UPDATE ON public.inteligencia_fotos_settings
FOR EACH ROW EXECUTE FUNCTION public.update_inteligencia_fotos_updated_at();