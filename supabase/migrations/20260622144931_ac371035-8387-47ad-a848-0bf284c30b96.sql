
CREATE TABLE public.crm_sales_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  plan TEXT NOT NULL,
  plan_label TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  nsu_order TEXT NOT NULL UNIQUE,
  infinitepay_link TEXT,
  invoice_slug TEXT,
  transaction_nsu TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ NOT NULL,
  paid_at TIMESTAMPTZ,
  raw_webhook JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_crm_sales_orders_status ON public.crm_sales_orders(status);
CREATE INDEX idx_crm_sales_orders_email ON public.crm_sales_orders(email);
CREATE INDEX idx_crm_sales_orders_created_at ON public.crm_sales_orders(created_at DESC);

GRANT ALL ON public.crm_sales_orders TO service_role;

ALTER TABLE public.crm_sales_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only access" ON public.crm_sales_orders
  FOR ALL USING (false) WITH CHECK (false);

CREATE TRIGGER update_crm_sales_orders_updated_at
  BEFORE UPDATE ON public.crm_sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
