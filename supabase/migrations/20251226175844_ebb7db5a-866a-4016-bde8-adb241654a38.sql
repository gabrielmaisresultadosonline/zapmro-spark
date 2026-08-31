-- Add columns to store InfiniPay verification data for manual payment checks
ALTER TABLE public.ads_orders 
ADD COLUMN IF NOT EXISTS invoice_slug text,
ADD COLUMN IF NOT EXISTS transaction_nsu text;