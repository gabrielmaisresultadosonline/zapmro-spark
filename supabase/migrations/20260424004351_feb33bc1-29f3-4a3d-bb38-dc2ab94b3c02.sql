
CREATE TABLE IF NOT EXISTS public.rendaext_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.rendaext_leads(id) ON DELETE SET NULL,
  nome_completo text NOT NULL,
  email text NOT NULL,
  whatsapp text NOT NULL,
  amount numeric NOT NULL DEFAULT 19.90,
  nsu_order text NOT NULL UNIQUE,
  infinitepay_link text,
  status text NOT NULL DEFAULT 'pending',
  paid_at timestamptz,
  email_sent boolean DEFAULT false,
  email_sent_at timestamptz,
  expired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rendaext_orders_email ON public.rendaext_orders(email);
CREATE INDEX IF NOT EXISTS idx_rendaext_orders_nsu ON public.rendaext_orders(nsu_order);
CREATE INDEX IF NOT EXISTS idx_rendaext_orders_status ON public.rendaext_orders(status);

ALTER TABLE public.rendaext_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only on rendaext_orders"
  ON public.rendaext_orders FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
