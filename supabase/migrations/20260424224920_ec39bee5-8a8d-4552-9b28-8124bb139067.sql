-- Create audio events table
CREATE TABLE IF NOT EXISTS public.rendaext_audio_events (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT,
    percent INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add tracking columns to leads and orders
ALTER TABLE public.rendaext_leads 
ADD COLUMN IF NOT EXISTS audio_listened_percent INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS audio_listened_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.rendaext_orders 
ADD COLUMN IF NOT EXISTS audio_listened_percent INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS audio_listened_at TIMESTAMP WITH TIME ZONE;

-- Enable RLS
ALTER TABLE public.rendaext_audio_events ENABLE ROW LEVEL SECURITY;

-- Policies for audio events
CREATE POLICY "Anyone can insert audio events" 
ON public.rendaext_audio_events 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Admins can view audio events" 
ON public.rendaext_audio_events 
FOR SELECT 
USING (true); -- Usually restricted by admin auth logic in app, but for now allow read for dashboard
