-- Create public bucket for cached profile images
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-cache', 'profile-cache', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to cached profile images
CREATE POLICY "Public read access for profile cache"
ON storage.objects FOR SELECT
USING (bucket_id = 'profile-cache');

-- Allow service role to upload cached images
CREATE POLICY "Service role can upload to profile cache"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'profile-cache');