-- Create table for payment orders with InfiniPay
CREATE TABLE public.payment_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  nsu_order TEXT NOT NULL UNIQUE,
  amount DECIMAL(10,2) NOT NULL DEFAULT 97.00,
  status TEXT NOT NULL DEFAULT 'pending',
  infinitepay_link TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '30 minutes'),
  paid_at TIMESTAMP WITH TIME ZONE,
  verified_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;

-- Policy for service role full access
CREATE POLICY "Service role full access on payment_orders"
ON public.payment_orders
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Policy for anyone to insert (create payment)
CREATE POLICY "Anyone can create payment order"
ON public.payment_orders
FOR INSERT
WITH CHECK (true);

-- Policy for anyone to read their own order by email
CREATE POLICY "Anyone can read own payment order"
ON public.payment_orders
FOR SELECT
USING (true);

-- Create index for faster lookups
CREATE INDEX idx_payment_orders_nsu ON public.payment_orders(nsu_order);
CREATE INDEX idx_payment_orders_email ON public.payment_orders(email);
CREATE INDEX idx_payment_orders_status ON public.payment_orders(status);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_payment_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_payment_orders_timestamp
BEFORE UPDATE ON public.payment_orders
FOR EACH ROW
EXECUTE FUNCTION public.update_payment_orders_updated_at();