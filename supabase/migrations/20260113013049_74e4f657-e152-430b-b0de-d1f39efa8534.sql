-- Add column for profile screenshot URL
ALTER TABLE public.free_trial_registrations 
ADD COLUMN IF NOT EXISTS profile_screenshot_url TEXT;

-- Create storage bucket for profile screenshots
INSERT INTO storage.buckets (id, name, public)
VALUES ('trial-screenshots', 'trial-screenshots', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to screenshots
CREATE POLICY "Public can view trial screenshots"
ON storage.objects
FOR SELECT
USING (bucket_id = 'trial-screenshots');

-- Allow anyone to upload trial screenshots
CREATE POLICY "Anyone can upload trial screenshots"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'trial-screenshots');

-- Allow anyone to update trial screenshots
CREATE POLICY "Anyone can update trial screenshots"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'trial-screenshots');