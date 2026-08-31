
-- Table for prompt categories (each folder from ZIP becomes a category)
CREATE TABLE public.prompts_mro_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  folder_name TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  image_url TEXT,
  is_active BOOLEAN DEFAULT true,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.prompts_mro_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on prompts_mro_items"
ON public.prompts_mro_items FOR ALL
USING (auth.role() = 'service_role'::text)
WITH CHECK (auth.role() = 'service_role'::text);

CREATE POLICY "Anyone can read active prompts"
ON public.prompts_mro_items FOR SELECT
USING (is_active = true);

-- Table for registered users
CREATE TABLE public.prompts_mro_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  last_access TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.prompts_mro_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on prompts_mro_users"
ON public.prompts_mro_users FOR ALL
USING (auth.role() = 'service_role'::text)
WITH CHECK (auth.role() = 'service_role'::text);

-- Admin settings
CREATE TABLE public.prompts_mro_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_email TEXT NOT NULL DEFAULT 'mro@gmail.com',
  admin_password TEXT NOT NULL DEFAULT 'Ga145523@',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.prompts_mro_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on prompts_mro_settings"
ON public.prompts_mro_settings FOR ALL
USING (auth.role() = 'service_role'::text)
WITH CHECK (auth.role() = 'service_role'::text);

-- Insert default admin
INSERT INTO public.prompts_mro_settings (admin_email, admin_password) VALUES ('mro@gmail.com', 'Ga145523@');

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION public.update_prompts_mro_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_prompts_mro_items_updated_at
BEFORE UPDATE ON public.prompts_mro_items
FOR EACH ROW EXECUTE FUNCTION public.update_prompts_mro_updated_at();

CREATE TRIGGER update_prompts_mro_users_updated_at
BEFORE UPDATE ON public.prompts_mro_users
FOR EACH ROW EXECUTE FUNCTION public.update_prompts_mro_updated_at();
