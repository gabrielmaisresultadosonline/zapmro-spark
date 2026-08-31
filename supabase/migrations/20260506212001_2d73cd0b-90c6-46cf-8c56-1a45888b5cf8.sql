CREATE TABLE IF NOT EXISTS public.wpp_connection_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL, -- 'connection_lost', 'connection_restored', 'manual_disconnect', 'reboot_protection_active'
    status TEXT NOT NULL,
    details TEXT,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.wpp_connection_logs ENABLE ROW LEVEL SECURITY;

-- Allow system to insert logs
CREATE POLICY "Allow system to insert connection logs" 
ON public.wpp_connection_logs 
FOR INSERT 
WITH CHECK (true);

-- Allow admins to view logs (simplified for now to true, should be restricted in production)
CREATE POLICY "Allow anyone to view connection logs" 
ON public.wpp_connection_logs 
FOR SELECT 
USING (true);
