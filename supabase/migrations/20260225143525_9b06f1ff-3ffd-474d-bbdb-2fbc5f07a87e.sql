
-- Create table for international Prompts users (Stripe-based)
CREATE TABLE public.promptsin_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  password TEXT NOT NULL,
  phone TEXT,
  copies_count INTEGER NOT NULL DEFAULT 0,
  copies_limit INTEGER NOT NULL DEFAULT 5,
  is_paid BOOLEAN NOT NULL DEFAULT false,
  paid_at TIMESTAMP WITH TIME ZONE,
  subscription_end TIMESTAMP WITH TIME ZONE,
  stripe_customer_id TEXT,
  stripe_session_id TEXT,
  plan_type TEXT DEFAULT 'monthly',
  status TEXT NOT NULL DEFAULT 'active',
  last_access TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.promptsin_users ENABLE ROW LEVEL SECURITY;

-- Only service role can access
CREATE POLICY "Service role full access on promptsin_users"
  ON public.promptsin_users
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Create orders table for Stripe payments
CREATE TABLE public.promptsin_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT,
  phone TEXT,
  amount NUMERIC NOT NULL DEFAULT 0,
  plan_type TEXT NOT NULL DEFAULT 'monthly',
  status TEXT NOT NULL DEFAULT 'pending',
  stripe_session_id TEXT,
  stripe_payment_intent TEXT,
  paid_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  access_created BOOLEAN DEFAULT false,
  email_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.promptsin_orders ENABLE ROW LEVEL SECURITY;

-- Only service role can access
CREATE POLICY "Service role full access on promptsin_orders"
  ON public.promptsin_orders
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Settings table
CREATE TABLE public.promptsin_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_email TEXT NOT NULL DEFAULT 'mro@gmail.com',
  admin_password TEXT NOT NULL DEFAULT 'Ga145523@',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.promptsin_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on promptsin_settings"
  ON public.promptsin_settings
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Insert default settings
INSERT INTO public.promptsin_settings (admin_email, admin_password) VALUES ('mro@gmail.com', 'Ga145523@');
