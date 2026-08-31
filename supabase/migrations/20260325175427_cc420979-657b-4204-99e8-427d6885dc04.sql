
CREATE TABLE public.renda_extra_materiais (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  video_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT DEFAULT 0,
  order_index INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.renda_extra_materiais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active materiais"
  ON public.renda_extra_materiais
  FOR SELECT
  TO public
  USING (is_active = true);

CREATE POLICY "Service role full access on renda_extra_materiais"
  ON public.renda_extra_materiais
  FOR ALL
  TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
