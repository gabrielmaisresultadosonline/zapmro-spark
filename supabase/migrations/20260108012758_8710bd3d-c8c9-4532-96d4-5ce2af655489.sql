-- Criar tabela para armazenar logs do webhook InfiniPay
CREATE TABLE public.infinitepay_webhook_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  event_type TEXT NOT NULL DEFAULT 'webhook_received',
  order_nsu TEXT,
  transaction_nsu TEXT,
  email TEXT,
  username TEXT,
  affiliate_id TEXT,
  amount NUMERIC,
  status TEXT NOT NULL DEFAULT 'received',
  payload JSONB,
  result_message TEXT,
  order_found BOOLEAN DEFAULT false,
  order_id UUID
);

-- Criar índice para buscas rápidas
CREATE INDEX idx_webhook_logs_created_at ON public.infinitepay_webhook_logs(created_at DESC);
CREATE INDEX idx_webhook_logs_order_nsu ON public.infinitepay_webhook_logs(order_nsu);

-- Habilitar RLS
ALTER TABLE public.infinitepay_webhook_logs ENABLE ROW LEVEL SECURITY;

-- Política para leitura apenas por admins (via service role)
-- Não precisa de política para usuários normais pois é só para admin