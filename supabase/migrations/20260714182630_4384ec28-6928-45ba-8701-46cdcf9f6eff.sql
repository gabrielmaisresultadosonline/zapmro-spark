
CREATE TABLE public.sales_tutorials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  module TEXT NOT NULL DEFAULT 'Geral',
  title TEXT NOT NULL,
  description TEXT,
  cover_url TEXT,
  video_url TEXT,
  button1_label TEXT,
  button1_url TEXT,
  button2_label TEXT,
  button2_url TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.sales_tutorials TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_tutorials TO authenticated;
GRANT ALL ON public.sales_tutorials TO service_role;

ALTER TABLE public.sales_tutorials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view active tutorials" ON public.sales_tutorials
  FOR SELECT USING (true);

CREATE POLICY "Anyone can manage tutorials" ON public.sales_tutorials
  FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER update_sales_tutorials_updated_at
  BEFORE UPDATE ON public.sales_tutorials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
