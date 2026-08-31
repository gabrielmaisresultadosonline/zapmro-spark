-- Adicionar campo phone na tabela mro_orders
ALTER TABLE public.mro_orders ADD COLUMN IF NOT EXISTS phone TEXT;

-- Adicionar campo expired_at para controlar expiração após 30 minutos
ALTER TABLE public.mro_orders ADD COLUMN IF NOT EXISTS expired_at TIMESTAMP WITH TIME ZONE;