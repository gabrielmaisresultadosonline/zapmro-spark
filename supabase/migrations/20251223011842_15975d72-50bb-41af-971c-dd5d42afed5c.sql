-- Add display options columns to metodo_seguidor_videos table
ALTER TABLE public.metodo_seguidor_videos 
ADD COLUMN IF NOT EXISTS show_title boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS show_number boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS show_play_button boolean DEFAULT true;

-- Update existing videos to have all display options enabled by default
UPDATE public.metodo_seguidor_videos 
SET show_title = true, show_number = true, show_play_button = true 
WHERE show_title IS NULL;