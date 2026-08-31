-- Tabela para pedidos da ferramenta MRO Instagram
CREATE TABLE public.mro_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  username TEXT NOT NULL,
  plan_type TEXT NOT NULL DEFAULT 'annual', -- 'annual' ou 'lifetime'
  amount NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'paid', 'completed', 'failed'
  nsu_order TEXT NOT NULL,
  infinitepay_link TEXT,
  api_created BOOLEAN DEFAULT FALSE,
  email_sent BOOLEAN DEFAULT FALSE,
  paid_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.mro_orders ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Anyone can create mro order" 
ON public.mro_orders 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Anyone can read own mro order by email" 
ON public.mro_orders 
FOR SELECT 
USING (true);

CREATE POLICY "Service role full access on mro_orders" 
ON public.mro_orders 
FOR ALL 
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Index para busca rápida
CREATE INDEX idx_mro_orders_nsu ON public.mro_orders(nsu_order);
CREATE INDEX idx_mro_orders_email ON public.mro_orders(email);
CREATE INDEX idx_mro_orders_status ON public.mro_orders(status);