-- Create table for Euro orders with Stripe
CREATE TABLE public.mro_euro_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  username TEXT NOT NULL,
  phone TEXT,
  plan_type TEXT NOT NULL DEFAULT 'annual',
  amount NUMERIC NOT NULL DEFAULT 300,
  status TEXT NOT NULL DEFAULT 'pending',
  stripe_session_id TEXT,
  stripe_payment_intent TEXT,
  api_created BOOLEAN DEFAULT false,
  email_sent BOOLEAN DEFAULT false,
  paid_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.mro_euro_orders ENABLE ROW LEVEL SECURITY;

-- Public can insert orders
CREATE POLICY "Anyone can create euro order" 
ON public.mro_euro_orders 
FOR INSERT 
WITH CHECK (true);

-- Public can read orders
CREATE POLICY "Anyone can read euro orders" 
ON public.mro_euro_orders 
FOR SELECT 
USING (true);

-- Service role full access
CREATE POLICY "Service role full access on mro_euro_orders" 
ON public.mro_euro_orders 
FOR ALL 
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');