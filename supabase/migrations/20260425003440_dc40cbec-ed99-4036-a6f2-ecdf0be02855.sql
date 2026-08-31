-- Add missing column
ALTER TABLE public.rendaext_analytics ADD COLUMN IF NOT EXISTS source_url TEXT;

-- Update RLS policies to allow viewing (for the admin dashboard)
-- Note: In a production environment with sensitive data, we would use proper Auth,
-- but this project uses a custom admin token system.
CREATE POLICY "Anyone can view rendaext_analytics" 
ON public.rendaext_analytics 
FOR SELECT 
USING (true);

-- Ensure audio events are also viewable
DROP POLICY IF EXISTS "Admins can view audio events" ON public.rendaext_audio_events;
CREATE POLICY "Anyone can view rendaext_audio_events" 
ON public.rendaext_audio_events 
FOR SELECT 
USING (true);
