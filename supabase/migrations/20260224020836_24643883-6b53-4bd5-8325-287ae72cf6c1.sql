
-- Add copies tracking and payment fields to prompts_mro_users
ALTER TABLE public.prompts_mro_users 
ADD COLUMN IF NOT EXISTS copies_count integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS copies_limit integer NOT NULL DEFAULT 5,
ADD COLUMN IF NOT EXISTS is_paid boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS payment_nsu text,
ADD COLUMN IF NOT EXISTS paid_at timestamp with time zone;

-- Create prompts_mro_orders table for payment tracking
CREATE TABLE IF NOT EXISTS public.prompts_mro_payment_orders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.prompts_mro_users(id),
  email text NOT NULL,
  amount numeric NOT NULL DEFAULT 67,
  nsu_order text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  infinitepay_link text,
  paid_at timestamp with time zone,
  expired_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.prompts_mro_payment_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on prompts_mro_payment_orders" 
ON public.prompts_mro_payment_orders 
FOR ALL 
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');
