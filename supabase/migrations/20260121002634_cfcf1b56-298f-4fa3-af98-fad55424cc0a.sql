-- Tabela de pedidos do Corretor MRO
CREATE TABLE IF NOT EXISTS public.corretor_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT,
  phone TEXT,
  amount NUMERIC NOT NULL DEFAULT 19.90,
  nsu_order TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  infinitepay_link TEXT,
  expired_at TIMESTAMP WITH TIME ZONE,
  paid_at TIMESTAMP WITH TIME ZONE,
  access_created BOOLEAN DEFAULT FALSE,
  email_sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para busca
CREATE INDEX IF NOT EXISTS idx_corretor_orders_email ON public.corretor_orders(email);
CREATE INDEX IF NOT EXISTS idx_corretor_orders_nsu ON public.corretor_orders(nsu_order);
CREATE INDEX IF NOT EXISTS idx_corretor_orders_status ON public.corretor_orders(status);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION public.update_corretor_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_corretor_orders_updated_at
BEFORE UPDATE ON public.corretor_orders
FOR EACH ROW
EXECUTE FUNCTION public.update_corretor_orders_updated_at();

-- RLS: acesso apenas via service role (edge functions)
ALTER TABLE public.corretor_orders ENABLE ROW LEVEL SECURITY;

-- Política para leitura pública (admin)
CREATE POLICY "Allow service role full access"
ON public.corretor_orders
FOR ALL
USING (true)
WITH CHECK (true);

-- Adicionar configuração do corretor-webhook no config.toml
COMMENT ON TABLE public.corretor_orders IS 'Pedidos de pagamento do Corretor MRO via InfiniPay';