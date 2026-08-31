CREATE TABLE public.broadcast_email_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  error_message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.broadcast_email_logs ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service role full access on broadcast_email_logs" ON public.broadcast_email_logs
  AS RESTRICTIVE FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow public insert for the broadcast function
CREATE POLICY "Anyone can insert broadcast logs" ON public.broadcast_email_logs
  FOR INSERT
  WITH CHECK (true);

-- Allow public read
CREATE POLICY "Anyone can read broadcast logs" ON public.broadcast_email_logs
  FOR SELECT
  USING (true);