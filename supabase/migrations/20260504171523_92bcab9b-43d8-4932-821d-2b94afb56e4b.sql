ALTER TABLE public.mro_orders ADD COLUMN IF NOT EXISTS whatsapp_sent BOOLEAN DEFAULT false;

-- Mark existing completed/paid orders as sent if they already have delivery logs
UPDATE public.mro_orders
SET whatsapp_sent = true
WHERE id IN (
  SELECT order_id::uuid 
  FROM public.crm_webhook_delivery_logs 
  WHERE status = 'success' 
  AND order_id IS NOT NULL 
  AND order_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
);