
-- Create prompts_mro_orders table for payment tracking
CREATE TABLE public.prompts_mro_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT,
  phone TEXT,
  amount NUMERIC NOT NULL DEFAULT 97,
  plan_type TEXT NOT NULL DEFAULT 'annual',
  status TEXT NOT NULL DEFAULT 'pending',
  nsu_order TEXT NOT NULL,
  infinitepay_link TEXT,
  paid_at TIMESTAMP WITH TIME ZONE,
  expired_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  access_created BOOLEAN DEFAULT false,
  email_sent BOOLEAN DEFAULT false,
  transaction_nsu TEXT,
  invoice_slug TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.prompts_mro_orders ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service role full access on prompts_mro_orders"
  ON public.prompts_mro_orders FOR ALL
  USING (auth.role() = 'service_role'::text)
  WITH CHECK (auth.role() = 'service_role'::text);

-- Allow anyone to create orders (needed for checkout)
CREATE POLICY "Anyone can create prompts order"
  ON public.prompts_mro_orders FOR INSERT
  WITH CHECK (true);

-- Allow anyone to read orders (needed for verification)
CREATE POLICY "Anyone can read prompts orders"
  ON public.prompts_mro_orders FOR SELECT
  USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_prompts_mro_orders_updated_at
  BEFORE UPDATE ON public.prompts_mro_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_prompts_mro_updated_at();
