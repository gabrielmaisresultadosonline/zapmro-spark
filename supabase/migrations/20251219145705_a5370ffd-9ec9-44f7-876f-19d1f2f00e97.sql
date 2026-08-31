-- Ensure profile-cache bucket exists and is public
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-cache', 'profile-cache', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Policy for public read access
DROP POLICY IF EXISTS "Public read access for profile cache" ON storage.objects;
CREATE POLICY "Public read access for profile cache"
ON storage.objects FOR SELECT
USING (bucket_id = 'profile-cache');

-- Policy for service role to upload
DROP POLICY IF EXISTS "Service role can upload to profile cache" ON storage.objects;
CREATE POLICY "Service role can upload to profile cache"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'profile-cache');

-- Policy for service role to update
DROP POLICY IF EXISTS "Service role can update profile cache" ON storage.objects;
CREATE POLICY "Service role can update profile cache"
ON storage.objects FOR UPDATE
USING (bucket_id = 'profile-cache');

-- Policy for service role to delete
DROP POLICY IF EXISTS "Service role can delete from profile cache" ON storage.objects;
CREATE POLICY "Service role can delete from profile cache"
ON storage.objects FOR DELETE
USING (bucket_id = 'profile-cache');