-- Table for hero banners/slides (1920x1080)
CREATE TABLE public.metodo_seguidor_banners (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title VARCHAR,
  description TEXT,
  image_url TEXT NOT NULL,
  link_url TEXT,
  link_text VARCHAR,
  is_active BOOLEAN DEFAULT true,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table for upsell/orderbump buttons inside modules
CREATE TABLE public.metodo_seguidor_upsells (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  module_id UUID REFERENCES public.metodo_seguidor_modules(id) ON DELETE CASCADE,
  title VARCHAR NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  button_text VARCHAR DEFAULT 'Saiba Mais',
  button_url TEXT NOT NULL,
  price VARCHAR,
  original_price VARCHAR,
  is_active BOOLEAN DEFAULT true,
  show_after_days INTEGER DEFAULT 2,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.metodo_seguidor_banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metodo_seguidor_upsells ENABLE ROW LEVEL SECURITY;

-- RLS policies for banners
CREATE POLICY "Banners are viewable by everyone"
ON public.metodo_seguidor_banners FOR SELECT
USING (true);

CREATE POLICY "Service role can manage banners"
ON public.metodo_seguidor_banners FOR ALL
USING (true);

-- RLS policies for upsells
CREATE POLICY "Upsells are viewable by everyone"
ON public.metodo_seguidor_upsells FOR SELECT
USING (true);

CREATE POLICY "Service role can manage upsells"
ON public.metodo_seguidor_upsells FOR ALL
USING (true);

-- Update triggers
CREATE TRIGGER update_metodo_seguidor_banners_updated_at
BEFORE UPDATE ON public.metodo_seguidor_banners
FOR EACH ROW
EXECUTE FUNCTION public.update_metodo_seguidor_updated_at();

CREATE TRIGGER update_metodo_seguidor_upsells_updated_at
BEFORE UPDATE ON public.metodo_seguidor_upsells
FOR EACH ROW
EXECUTE FUNCTION public.update_metodo_seguidor_updated_at();