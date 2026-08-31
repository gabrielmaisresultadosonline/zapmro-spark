-- Create table for ZAPMRO orders (WhatsApp tool)
CREATE TABLE IF NOT EXISTS public.zapmro_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  username TEXT NOT NULL,
  phone TEXT,
  plan_type TEXT NOT NULL DEFAULT 'annual',
  amount NUMERIC NOT NULL DEFAULT 397,
  status TEXT NOT NULL DEFAULT 'pending',
  nsu_order TEXT NOT NULL,
  infinitepay_link TEXT,
  api_created BOOLEAN DEFAULT false,
  email_sent BOOLEAN DEFAULT false,
  paid_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  expired_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.zapmro_orders ENABLE ROW LEVEL SECURITY;

-- Allow anyone to create orders (checkout flow)
CREATE POLICY "Anyone can create zapmro order" 
ON public.zapmro_orders 
FOR INSERT 
WITH CHECK (true);

-- Allow anyone to read orders (for status check)
CREATE POLICY "Anyone can read zapmro orders" 
ON public.zapmro_orders 
FOR SELECT 
USING (true);

-- Allow service role full access
CREATE POLICY "Service role full access on zapmro_orders" 
ON public.zapmro_orders 
FOR ALL 
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Create updated_at trigger
CREATE TRIGGER update_zapmro_orders_updated_at
  BEFORE UPDATE ON public.zapmro_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_zapmro_users_updated_at();