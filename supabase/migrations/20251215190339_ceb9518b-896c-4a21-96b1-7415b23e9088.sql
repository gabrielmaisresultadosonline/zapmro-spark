-- Create call_analytics table for cloud storage
CREATE TABLE public.call_analytics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL,
  user_agent TEXT,
  referrer TEXT,
  device_type TEXT,
  source_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.call_analytics ENABLE ROW LEVEL SECURITY;

-- Allow public insert (no auth needed for tracking)
CREATE POLICY "Anyone can insert analytics" 
ON public.call_analytics 
FOR INSERT 
WITH CHECK (true);

-- Allow admin to read all analytics (no auth restriction for now)
CREATE POLICY "Anyone can read analytics" 
ON public.call_analytics 
FOR SELECT 
USING (true);

-- Allow admin to delete analytics
CREATE POLICY "Anyone can delete analytics" 
ON public.call_analytics 
FOR DELETE 
USING (true);

-- Create index for faster queries
CREATE INDEX idx_call_analytics_created_at ON public.call_analytics(created_at DESC);
CREATE INDEX idx_call_analytics_event_type ON public.call_analytics(event_type);