-- Create table for logging outgoing CRM webhook deliveries
CREATE TABLE IF NOT EXISTS public.crm_webhook_delivery_logs (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    webhook_id UUID REFERENCES public.crm_webhooks(id) ON DELETE SET NULL,
    to_number TEXT NOT NULL,
    message TEXT,
    status TEXT NOT NULL, -- 'success' or 'error'
    error_message TEXT,
    order_id TEXT, -- Reference to the order ID from mro_orders if applicable
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.crm_webhook_delivery_logs ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view logs (admin page access)
CREATE POLICY "Admin can view CRM webhook logs" 
ON public.crm_webhook_delivery_logs 
FOR SELECT 
TO authenticated 
USING (true);

-- Allow service role (Edge Functions) to insert logs
CREATE POLICY "Service role can insert CRM webhook logs" 
ON public.crm_webhook_delivery_logs 
FOR INSERT 
TO service_role 
WITH CHECK (true);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_crm_webhook_logs_webhook_id ON public.crm_webhook_delivery_logs(webhook_id);
CREATE INDEX IF NOT EXISTS idx_crm_webhook_logs_created_at ON public.crm_webhook_delivery_logs(created_at DESC);