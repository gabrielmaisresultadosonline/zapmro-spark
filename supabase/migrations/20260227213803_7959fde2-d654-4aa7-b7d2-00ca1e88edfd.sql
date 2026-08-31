-- Enable realtime for mro_direct_logs
ALTER PUBLICATION supabase_realtime ADD TABLE public.mro_direct_logs;

-- Add column to track if AI was manually paused for a specific sender
ALTER TABLE public.mro_direct_logs 
ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'outgoing';

-- Add incoming message content tracking
ALTER TABLE public.mro_direct_logs
ADD COLUMN IF NOT EXISTS incoming_text text;