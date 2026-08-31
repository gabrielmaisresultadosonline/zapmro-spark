
CREATE TABLE public.sales_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  cover_url text,
  order_index int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.sales_modules TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_modules TO authenticated;
GRANT ALL ON public.sales_modules TO service_role;

ALTER TABLE public.sales_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view active modules" ON public.sales_modules
  FOR SELECT USING (true);

CREATE POLICY "Anyone can manage modules" ON public.sales_modules
  FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER update_sales_modules_updated_at
  BEFORE UPDATE ON public.sales_modules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.sales_tutorials
  ADD COLUMN IF NOT EXISTS module_id uuid REFERENCES public.sales_modules(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sales_tutorials_module_id ON public.sales_tutorials(module_id);
